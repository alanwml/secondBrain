from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("thoughts", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="thought",
            name="context_decision_made",
            field=models.BooleanField(default=False),
        ),
    ]
