from alembic import op
import sqlalchemy as sa

revision = "0006_driver_onboarding"
down_revision = "0005_rule_charge_components"


def upgrade():
    op.create_table(
        "driver_accounts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("full_name", sa.String(120), nullable=False),
        sa.Column("email", sa.String(254), unique=True, nullable=False),
        sa.Column("phone", sa.String(16), unique=True, nullable=False),
        sa.Column("city_id", sa.Integer(), sa.ForeignKey("cities.id"), nullable=False),
        sa.Column("password_hash", sa.String(160), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("licence_placeholder", sa.String(32)),
        sa.Column("vehicle_documents_ready", sa.Boolean(), nullable=False),
        sa.Column("review_feedback", sa.String(1000)),
        sa.Column("revision", sa.Integer(), nullable=False),
    )
    op.create_index("ix_driver_accounts_status", "driver_accounts", ["status"])
    op.create_table(
        "driver_sessions",
        sa.Column("token_hash", sa.String(64), primary_key=True),
        sa.Column("driver_id", sa.Integer(), sa.ForeignKey("driver_accounts.id"), nullable=False),
        sa.Column("expires_at", sa.Integer(), nullable=False),
    )
    op.create_index("ix_driver_sessions_driver_id", "driver_sessions", ["driver_id"])
    op.create_table(
        "driver_vehicles",
        sa.Column("driver_id", sa.Integer(), sa.ForeignKey("driver_accounts.id"), primary_key=True),
        sa.Column("vehicle_class", sa.String(30), nullable=False),
        sa.Column("manufacturer", sa.String(60), nullable=False),
        sa.Column("model", sa.String(60), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("colour", sa.String(40), nullable=False),
        sa.Column("registration_number", sa.String(32), unique=True, nullable=False),
        sa.Column("fuel_type", sa.String(16), nullable=False),
        sa.Column("claimed_fuel_efficiency", sa.Numeric(8, 3)),
        sa.Column("status", sa.String(32), nullable=False),
    )
    op.create_table(
        "driver_reviews",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("driver_id", sa.Integer(), sa.ForeignKey("driver_accounts.id"), nullable=False),
        sa.Column("previous_status", sa.String(32), nullable=False),
        sa.Column("new_status", sa.String(32), nullable=False),
        sa.Column("actor", sa.String(32), nullable=False),
        sa.Column("feedback", sa.String(1000)),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_driver_reviews_driver_id", "driver_reviews", ["driver_id"])


def downgrade():
    op.drop_table("driver_reviews")
    op.drop_table("driver_vehicles")
    op.drop_table("driver_sessions")
    op.drop_table("driver_accounts")
