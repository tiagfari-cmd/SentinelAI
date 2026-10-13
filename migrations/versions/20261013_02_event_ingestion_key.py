"""Add optional unique ingestion key without changing existing events."""

from alembic import op
import sqlalchemy as sa

revision = "20261013_02"
down_revision = "20261012_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("authentication_events", sa.Column("ingestion_key", sa.String(128), nullable=True))
    op.create_index("ix_authentication_events_ingestion_key", "authentication_events",
                    ["ingestion_key"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_authentication_events_ingestion_key", table_name="authentication_events")
    with op.batch_alter_table("authentication_events") as batch:
        batch.drop_column("ingestion_key")
