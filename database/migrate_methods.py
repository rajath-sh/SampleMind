"""Move assessment method metadata to the version registry without losing history."""
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import inspect, select

from app.common import AIAnalysis, ModelRegistry


def normalize_assessment_methods(connection):
    inspector = inspect(connection)
    if not inspector.has_table("AIAnalysis"):
        return
    columns = {column["name"] for column in inspector.get_columns("AIAnalysis")}
    if "model_registry_id" in columns:
        return

    registry = ModelRegistry.__table__
    registry.create(connection, checkfirst=True)
    known = set(connection.scalars(select(registry.c.model_version)))
    methods = connection.exec_driver_sql('''
        SELECT model_version, MIN(model_name), MIN(feature_schema_version)
        FROM "AIAnalysis" GROUP BY model_version
    ''')
    now = datetime.now(timezone.utc)
    for version, name, schema in methods.all():
        if version not in known:
            connection.execute(registry.insert().values(
                model_version=version, model_name=name, feature_schema_version=schema,
                artifact_uri="legacy assessment", training_data_version="unverified",
                trained_at=now, is_active=False,
            ))

    if connection.dialect.name == "sqlite":
        connection.exec_driver_sql('ALTER TABLE "AIAnalysis" RENAME TO "AIAnalysis_legacy"')
        target = AIAnalysis.__table__
        target.create(connection)
        names = [column.name for column in target.columns]
        if "input_snapshot" not in columns:
            names.remove("input_snapshot")
        destination = ", ".join(names)
        source = ", ".join(f"m.{name}" if name == "model_registry_id" else f"a.{name}" for name in names)
        connection.exec_driver_sql(f'''
            INSERT INTO "AIAnalysis" ({destination})
            SELECT {source} FROM "AIAnalysis_legacy" AS a
            JOIN "ModelRegistry" AS m ON m.model_version = a.model_version
        ''')
        old_count = connection.exec_driver_sql('SELECT COUNT(*) FROM "AIAnalysis_legacy"').scalar_one()
        new_count = connection.exec_driver_sql('SELECT COUNT(*) FROM "AIAnalysis"').scalar_one()
        if old_count != new_count:
            raise RuntimeError("Assessment migration lost records.")
        connection.exec_driver_sql('DROP TABLE "AIAnalysis_legacy"')
    else:
        connection.exec_driver_sql('ALTER TABLE "AIAnalysis" ADD COLUMN model_registry_id BIGINT')
        connection.exec_driver_sql('''
            UPDATE "AIAnalysis" AS a SET model_registry_id = m.model_registry_id
            FROM "ModelRegistry" AS m WHERE a.model_version = m.model_version
        ''')
        if "v_latest_sample_risk" in inspector.get_view_names():
            view_sql = Path(__file__).with_name("02_views.sql").read_text(encoding="utf-8")
            start = view_sql.index("CREATE OR REPLACE VIEW v_latest_sample_risk AS")
            connection.exec_driver_sql(view_sql[start:view_sql.index(";", start)])
        connection.exec_driver_sql('''
            ALTER TABLE "AIAnalysis"
            ALTER COLUMN model_registry_id SET NOT NULL,
            ADD FOREIGN KEY (model_registry_id) REFERENCES "ModelRegistry" (model_registry_id) ON DELETE RESTRICT,
            DROP COLUMN model_name, DROP COLUMN model_version, DROP COLUMN feature_schema_version
        ''')
        connection.exec_driver_sql('CREATE INDEX IF NOT EXISTS idx_aianalysis_method ON "AIAnalysis" (model_registry_id)')

