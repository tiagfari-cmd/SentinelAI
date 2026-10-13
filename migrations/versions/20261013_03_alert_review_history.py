"""Add human review state and history without deleting detection evidence."""

from alembic import op
import sqlalchemy as sa

revision = "20261013_03"
down_revision = "20261013_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("security_alerts", sa.Column("review_status", sa.String(20), nullable=False, server_default="open"))
    op.add_column("security_alerts", sa.Column("review_note", sa.String(1000), nullable=False, server_default=""))
    op.add_column("security_alerts", sa.Column("review_revision", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("security_alerts", sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_security_alerts_review_status", "security_alerts", ["review_status"])
    op.create_table("alert_reviews",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("alert_id", sa.Integer(), sa.ForeignKey("security_alerts.id"), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("review_status", sa.String(20), nullable=False),
        sa.Column("review_note", sa.String(1000), nullable=False),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("alert_id", "revision", name="uq_alert_review_revision"))
    op.create_index("ix_alert_reviews_alert_id", "alert_reviews", ["alert_id"])


def downgrade() -> None:
    op.drop_index("ix_alert_reviews_alert_id", table_name="alert_reviews")
    op.drop_table("alert_reviews")
    op.drop_index("ix_security_alerts_review_status", table_name="security_alerts")
    with op.batch_alter_table("security_alerts") as batch:
        for column in ("reviewed_at", "review_revision", "review_note", "review_status"):
            batch.drop_column(column)
