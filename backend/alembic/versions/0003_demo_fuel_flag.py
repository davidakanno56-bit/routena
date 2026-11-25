from alembic import op
import sqlalchemy as sa

revision = "0003_demo_fuel_flag"
down_revision = "0002_nationwide_service_areas"


def upgrade():
    op.add_column("fuel_observations", sa.Column("is_demo", sa.Boolean, nullable=False, server_default=sa.false()))


def downgrade():
    op.drop_column("fuel_observations", "is_demo")
