from alembic import op
import sqlalchemy as sa

revision = "0005_rule_charge_components"
down_revision = "0004_driver_economics_rules"


def upgrade():
    with op.batch_alter_table("fare_rules") as batch:
        batch.add_column(sa.Column("pickup_allowance", sa.Numeric(12, 2), nullable=True))
        batch.add_column(sa.Column("tolls", sa.Numeric(12, 2), nullable=True))
        batch.add_column(sa.Column("payment_costs", sa.Numeric(12, 2), nullable=True))
        batch.add_column(sa.Column("applicable_taxes", sa.Numeric(12, 2), nullable=True))


def downgrade():
    with op.batch_alter_table("fare_rules") as batch:
        batch.drop_column("applicable_taxes")
        batch.drop_column("payment_costs")
        batch.drop_column("tolls")
        batch.drop_column("pickup_allowance")
