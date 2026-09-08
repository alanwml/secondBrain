const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = __dirname;
function loadDotEnv() {
  const envFile = path.join(ROOT, '.env');
  if (!fs.existsSync(envFile)) return;
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  }
}
loadDotEnv();
const DATA_DIR = path.join(ROOT, 'data');
const THOUGHTS_FILE = path.join(DATA_DIR, 'thoughts.json');
const JOBS_FILE = path.join(DATA_DIR, 'analysis-jobs.json');
const PORT = Number(process.env.PORT || 8000);
const PROVIDER = process.env.AI_PROVIDER || 'openai-compatible';
const BASE_URL = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const DEFAULT_MODEL = process.env.AI_MODEL || 'gpt-5.5';

const PRICING = {
  'gpt-5.5': { input: 5, output: 30 },
  'gpt-5.5-pro': { input: 30, output: 180 }
};

fs.mkdirSync(DATA_DIR, { recursive: true });
function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function writeJson(file, value) { fs.writeFileSync(file, JSON.stringify(value, null, 2)); }
let thoughts = readJson(THOUGHTS_FILE, []);
let jobs = readJson(JOBS_FILE, []);
jobs.forEach(job => { if (job.status === 'processing') job.status = 'queued'; });
writeJson(JOBS_FILE, jobs);

function send(res, status, body, contentType = 'application/json') { res.writeHead(status, { 'Content-Type': contentType, 'Cache-Control': 'no-store' }); res.end(contentType === 'application/json' ? JSON.stringify(body) : body); }
function readBody(req) { return new Promise((resolve, reject) => { let body = ''; req.on('data', chunk => { body += chunk; if (body.length > 2_000_000) reject(new Error('Request too large')); }); req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error('Invalid JSON')); } }); req.on('error', reject); }); }
function findThought(id) { return thoughts.find(thought => thought.id === id); }
function enqueue(thoughtId) { const existing = jobs.find(job => job.thoughtId === thoughtId && ['queued', 'processing'].includes(job.status)); if (existing) return existing; const job = { id: crypto.randomUUID(), thoughtId, status:'queued', createdAt:new Date().toISOString(), attempts:0 }; jobs.push(job); writeJson(JOBS_FILE, jobs); runQueue(); return job; }
function priceFor(model, usage) { const price = PRICING[model]; if (!price || !usage) return null; return ((Number(usage.input_tokens || 0) * price.input) + (Number(usage.output_tokens || 0) * price.output)) / 1_000_000; }
function textFromResponse(response) { if (response.output_text) return response.output_text; return (response.output || []).filter(item => item.type === 'message').flatMap(item => item.content || []).filter(item => item.type === 'output_text').map(item => item.text).join('\n'); }
function sourcesFromResponse(response) { return (response.output || []).filter(item => item.type === 'web_search_call').flatMap(item => item.action?.sources || []).map(source => ({ title:source.title || source.url, url:source.url })).filter(source => source.url); }
function parseAnalysis(text) { const cleaned = String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim(); try { const parsed = JSON.parse(cleaned); return { summary:parsed.summary || '', explanation:parsed.explanation || parsed.summary || cleaned, keyPoints:Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [], ambiguous:Boolean(parsed.ambiguous), contexts:Array.isArray(parsed.contexts) ? parsed.contexts.slice(0, 6) : [], relatedConcepts:Array.isArray(parsed.relatedConcepts) ? parsed.relatedConcepts.slice(0, 10) : [] }; } catch { return { summary:'', explanation:cleaned || 'The model returned no explanation.', keyPoints:[], ambiguous:false, contexts:[], relatedConcepts:[] }; } }
function relatedNotesFor(thought) { const words = new Set(thought.text.toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length > 3)); return thoughts.filter(candidate => candidate.id !== thought.id).map(candidate => { const overlap = candidate.text.toLowerCase().split(/[^a-z0-9]+/).filter(word => words.has(word)).length; return { candidate, overlap }; }).filter(item => item.overlap > 0).sort((a,b) => b.overlap - a.overlap).slice(0, 5).map(item => ({ id:item.candidate.id, text:item.candidate.text, type:item.candidate.type })); }
async function previewImage(url) { try { const response = await fetch(url, { headers:{ 'user-agent':'SecondBrainLocal/1.0' }, signal:AbortSignal.timeout(5000) }); const html = await response.text(); const match = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i); return match ? new URL(match[1], url).href : null; } catch { return null; } }
async function callProvider(thought) {
  const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('No AI key configured. Set OPENAI_API_KEY before starting server.js.');
  const model = process.env.AI_MODEL || DEFAULT_MODEL;
  const contextInstruction = thought.selectedContext ? `The user selected this context: "${thought.selectedContext}". Explain the term primarily in this context. If the selection is "all contexts", compare the major meanings.` : 'Detect whether the term or idea is ambiguous. If it has multiple plausible meanings, do not silently choose one.';
  const response = await fetch(`${BASE_URL}/responses`, { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${apiKey}` }, body:JSON.stringify({ model, tools:[{ type:'web_search_preview' }], include:['web_search_call.action.sources'], store:false, input:[{ role:'developer', content:`You are a thoughtful research assistant for a personal second brain. Analyze the user thought without changing its intent. Use web search when useful. ${contextInstruction} Return ONLY valid JSON with keys: summary (string), explanation (string), keyPoints (array of strings), ambiguous (boolean), contexts (array of objects with name, confidence from 0 to 1, summary, example), relatedConcepts (array of strings). If ambiguous, contexts should list the most useful interpretations and explanation should briefly compare them. Do not invent citations; source links are collected separately from the web search tool.` }, { role:'user', content:`Analyze this ${thought.type}:\n\n${thought.text}` }] }) });
  const data = await response.json(); if (!response.ok) throw new Error(data.error?.message || `AI provider returned ${response.status}`);
  const parsed = parseAnalysis(textFromResponse(data)); const sources = sourcesFromResponse(data).slice(0, 8); const imageCandidates = await Promise.all(sources.slice(0, 4).map(async source => ({ ...source, imageUrl:await previewImage(source.url) }))); const images = imageCandidates.filter(source => source.imageUrl).map(source => ({ title:source.title, url:source.url, imageUrl:source.imageUrl }));
  return { ...parsed, relatedNotes:relatedNotesFor(thought), sources, images, model:data.model || model, inputTokens:data.usage?.input_tokens ?? null, outputTokens:data.usage?.output_tokens ?? null, costUsd:priceFor(data.model || model, data.usage), pricing:PRICING[data.model || model] ? { inputPerMillion:PRICING[data.model || model].input, outputPerMillion:PRICING[data.model || model].output } : null, completedAt:new Date().toISOString() };
}
async function processJob(job) { const thought = findThought(job.thoughtId); if (!thought) { job.status = 'failed'; job.error = 'Thought not found'; return; } job.status = 'processing'; job.startedAt = new Date().toISOString(); job.attempts += 1; thought.aiStatus = 'processing'; thought.aiError = null; writeJson(JOBS_FILE, jobs); writeJson(THOUGHTS_FILE, thoughts); try { thought.aiAnalysis = await callProvider(thought); thought.contextOptions = thought.aiAnalysis.contexts || []; thought.contextStatus = thought.selectedContext ? 'resolved' : thought.aiAnalysis.ambiguous ? 'needs-selection' : 'not-needed'; thought.aiStatus = 'completed'; job.status = 'completed'; job.completedAt = new Date().toISOString(); } catch (error) { thought.aiStatus = 'failed'; thought.aiError = error.message; job.status = 'failed'; job.error = error.message; job.completedAt = new Date().toISOString(); } writeJson(JOBS_FILE, jobs); writeJson(THOUGHTS_FILE, thoughts); }
let queueRunning = false;
async function runQueue() { if (queueRunning) return; queueRunning = true; try { let job; while ((job = jobs.find(item => item.status === 'queued'))) await processJob(job); } finally { queueRunning = false; } }

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`); const pathname = url.pathname;
  if (pathname === '/api/status' && req.method === 'GET') return send(res, 200, { configured:Boolean(process.env.AI_API_KEY || process.env.OPENAI_API_KEY), provider:PROVIDER, model:DEFAULT_MODEL, baseUrl:BASE_URL });
  if (pathname === '/api/thoughts' && req.method === 'GET') return send(res, 200, thoughts);
  if (pathname === '/api/thoughts' && req.method === 'POST') { const body = await readBody(req); const thought = { id:body.id || crypto.randomUUID(), text:String(body.text || '').trim(), type:['note','task','idea'].includes(body.type) ? body.type : 'note', pinned:Boolean(body.pinned), completed:Boolean(body.completed), createdAt:body.createdAt || new Date().toISOString(), aiStatus:body.requestAnalysis ? 'queued' : 'none', aiAnalysis:null, aiError:null, contextStatus:'not-checked', selectedContext:null, contextOptions:[] }; if (!thought.text) return send(res, 400, { error:'Thought text is required' }); thoughts.unshift(thought); writeJson(THOUGHTS_FILE, thoughts); if (body.requestAnalysis && thought.type !== 'task') enqueue(thought.id); return send(res, 201, thought); }
  const thoughtMatch = pathname.match(/^\/api\/thoughts\/([^/]+)$/); const analyzeMatch = pathname.match(/^\/api\/thoughts\/([^/]+)\/analyze$/); const contextMatch = pathname.match(/^\/api\/thoughts\/([^/]+)\/context$/);
  if (thoughtMatch) { const id = thoughtMatch[1]; const thought = findThought(id); if (!thought) return send(res, 404, { error:'Thought not found' }); if (req.method === 'PATCH') { const body = await readBody(req); Object.assign(thought, { pinned:Boolean(body.pinned), completed:Boolean(body.completed) }); writeJson(THOUGHTS_FILE, thoughts); return send(res, 200, thought); } if (req.method === 'DELETE') { thoughts = thoughts.filter(item => item.id !== id); jobs = jobs.filter(job => job.thoughtId !== id); writeJson(THOUGHTS_FILE, thoughts); writeJson(JOBS_FILE, jobs); return send(res, 200, { ok:true }); } }
  if (analyzeMatch && req.method === 'POST') { const thought = findThought(analyzeMatch[1]); if (!thought) return send(res, 404, { error:'Thought not found' }); if (!['note','idea'].includes(thought.type)) return send(res, 400, { error:'Only notes and ideas can be analyzed' }); thought.aiStatus = 'queued'; thought.aiError = null; writeJson(THOUGHTS_FILE, thoughts); enqueue(thought.id); return send(res, 200, thought); }
  if (contextMatch && req.method === 'POST') { const thought = findThought(contextMatch[1]); if (!thought) return send(res, 404, { error:'Thought not found' }); const body = await readBody(req); const context = String(body.context || '').trim(); if (!context) return send(res, 400, { error:'Context is required' }); thought.selectedContext = context; thought.contextStatus = context === 'unresolved' ? 'unresolved' : 'resolved'; if (context === 'unresolved') { writeJson(THOUGHTS_FILE, thoughts); return send(res, 200, thought); } thought.aiStatus = 'queued'; thought.aiError = null; writeJson(THOUGHTS_FILE, thoughts); enqueue(thought.id); return send(res, 200, thought); }
  if (req.method === 'GET') { const safePath = path.normalize(path.join(ROOT, pathname === '/' ? 'index.html' : pathname)); if (!safePath.startsWith(ROOT) || !fs.existsSync(safePath) || fs.statSync(safePath).isDirectory()) return send(res, 404, 'Not found', 'text/plain'); const ext = path.extname(safePath); const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json' }; return send(res, 200, fs.readFileSync(safePath), types[ext] || 'application/octet-stream'); }
  return send(res, 404, { error:'Not found' });
}

const server = http.createServer((req, res) => { handle(req, res).catch(error => send(res, 500, { error:error.message })); });
server.listen(PORT, () => { console.log(`Second Brain running at http://localhost:${PORT}`); console.log(`AI provider: ${PROVIDER} · model: ${DEFAULT_MODEL} · key: ${process.env.AI_API_KEY || process.env.OPENAI_API_KEY ? 'configured' : 'not configured'}`); runQueue(); });
