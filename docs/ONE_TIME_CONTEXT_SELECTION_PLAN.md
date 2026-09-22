# One-Time Context Selection Plan

## Goal

When AI identifies that a thought has multiple plausible meanings, the user should choose the intended context once. The user should see ranked suggestions with probabilities and a final custom-context option.

After the user makes that decision:

- The chosen context is saved to the thought.
- The existing analysis remains unchanged.
- No second AI request is made.
- The context chooser never appears again for that thought.

Context selection is a classification step, not a re-analysis workflow.

## Desired user experience

For an ambiguous note or idea, the full analysis view should show:

```text
Choose a context

○ JavaScript vector graphics                 82% likely
  A browser-based interpretation involving...

○ Mathematical vectorisation                  61% likely
  A mathematical or machine-learning meaning...

○ Other context
  [ Enter your own context                         ]
  [Save context]
```

The probability is guidance from the AI, not a guarantee. The interface should make that clear through wording such as “likely” rather than presenting the number as certainty.

The user can select one suggested context or enter custom text. Once saved, the chooser is replaced by a compact record such as:

```text
Context selected
JavaScript vector graphics
```

The original note and original AI analysis remain available below it.

## State behavior

### Initial analysis

When the AI analysis completes:

- If the thought is not ambiguous, do not show the context chooser.
- If the thought is ambiguous, store the suggested contexts and mark the thought as requiring a one-time decision.

Recommended state:

```text
context_status = needs-selection
context_decision_made = false
selected_context = null
```

### User selects a suggested context

Save:

```text
selected_context = chosen context name
context_status = resolved
context_decision_made = true
```

Do not create an analysis job. Do not call the AI provider again.

### User enters a custom context

Save the trimmed text exactly as the user's selected context:

```text
selected_context = custom user text
context_status = resolved
context_decision_made = true
```

The custom context should be displayed the same way as a suggested context, with a label such as “Custom context.”

### Existing or already-resolved notes

If `context_decision_made` is true, the chooser must never be rendered, regardless of whether the note is opened again or the browser is refreshed.

The frontend must not rely only on temporary React state. The decision must be persisted by the backend.

## Data model changes

The current model already has:

- `selected_context`
- `context_status`

Add an explicit boolean:

```text
context_decision_made boolean not null default false
```

This makes the “only once” rule explicit instead of inferring it from nullable text or a status string.

### Why an explicit boolean is useful

It distinguishes these cases clearly:

| State | `selected_context` | `context_status` | `context_decision_made` |
|---|---|---|---|
| Not ambiguous | null | not-checked | false |
| Waiting for choice | null | needs-selection | false |
| Suggested choice saved | text | resolved | true |
| Custom choice saved | text | resolved | true |
| Legacy unresolved decision | null | unresolved | true |

The last row is retained only for backward compatibility with existing data. The new UI should not offer an unresolved action unless that behavior is explicitly desired later.

## API changes

### Existing analysis endpoint

The analysis endpoint should continue to run only once for a thought. Once a completed analysis exists, a new analysis request remains rejected.

### Context selection endpoint

Keep a dedicated endpoint:

```text
POST /api/thoughts/<id>/context/
```

Request for a suggested context:

```json
{
  "context": "JavaScript vector graphics"
}
```

Request for a custom context:

```json
{
  "context": "How vector databases store semantic embeddings"
}
```

The endpoint should:

1. Confirm the thought exists and belongs to the current user.
2. Reject an empty context.
3. Reject the request if `context_decision_made` is already true.
4. Save the selected context.
5. Mark the decision as resolved.
6. Return the updated thought.

It must not enqueue an analysis job.

If a second request arrives after the decision has been saved, return a conflict response such as:

```json
{
  "error": {
    "code": "context_already_selected",
    "message": "A context has already been selected for this thought."
  }
}
```

## Frontend implementation plan

### 1. Add the persisted field to the TypeScript type

Add:

```text
context_decision_made: boolean
```

### 2. Restrict when the chooser appears

Render the chooser only when:

```text
analysis exists
AND analysis contains context options
AND context_status is needs-selection
AND context_decision_made is false
```

Do not render it merely because `contexts` is a non-empty array.

### 3. Render suggested choices

Each choice should include:

- Name
- Rounded probability percentage
- Short explanation
- Optional example
- Selected state after saving

Suggested choices should be buttons so they are keyboard accessible.

### 4. Render the custom context option last

The final option should contain:

- A text input or textarea
- Validation for blank text
- A clear “Save custom context” button

The custom input should not submit until the user provides non-whitespace text.

### 5. Save without re-analysis

After the save request succeeds:

- Update the local thought state from the API response.
- Replace the chooser with the selected-context summary.
- Do not change the analysis status to queued.
- Do not start polling because no new job exists.

### 6. Handle stale or duplicate clicks

Disable the context controls while the save request is in progress. If the API returns a conflict, refresh the thought and show the already-selected context instead of displaying a generic error.

## Backend implementation steps

1. Add `context_decision_made` to the Thought model.
2. Create and apply a Django migration.
3. Update the legacy JSON importer.
4. Set the field to `true` for legacy records that already have a selected or unresolved context.
5. Set the field to `false` for legacy records that still require a selection.
6. Update the thought serializer.
7. Change the context endpoint so it only saves state and never queues a job.
8. Reject a second context-selection request.
9. Remove any re-analysis behavior from the context-selection flow.
10. Add API tests for suggested and custom contexts.

## Tests

### Backend

- Ambiguous analysis returns context options and `needs-selection`.
- Selecting a suggested context saves the context and does not create a job.
- Saving a custom context works after trimming whitespace.
- Empty custom context is rejected.
- A second selection returns a conflict.
- Legacy records import with the correct decision state.

### Frontend

- Context options show probabilities.
- Custom context appears after the suggested options.
- Blank custom text cannot be saved.
- Selecting a suggested option replaces the chooser.
- Saving a custom option replaces the chooser.
- Reopening the thought does not show the chooser again.
- Refreshing the browser does not show the chooser again.
- No analysis job or loading state starts after context selection.

## Important behavior change

The existing implementation currently queues a new analysis after a context is selected. That behavior must be removed for this version.

The selected context is user metadata attached to the original analysis. It does not modify or regenerate the explanation, key points, sources, or related concepts.

## Implementation order

1. Add the database field and migration.
2. Update the importer and serializer.
3. Change the context endpoint to save only.
4. Add backend tests.
5. Update the React type and chooser visibility rule.
6. Add the custom context input.
7. Add frontend save states and error handling.
8. Run the full backend test suite and frontend production build.
9. Manually verify the one-time behavior after a browser refresh.
