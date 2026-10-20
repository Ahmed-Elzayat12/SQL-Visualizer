import type { DataRow } from '../types/execution';

export const ECOMMERCE_RAW_SQL = `WITH customer_orders AS (
    SELECT 
        o.id AS "orderId",
        o."customerId",
        o."orderTotal",
        o."orderStatus",
        o."createdAt",
        c.tier,
        c."countryCode"
    FROM orders o
    INNER JOIN customers c ON o."customerId" = c.id
    WHERE o."orderStatus" != 'CANCELLED'
),
customer_metrics AS (
    SELECT 
        "customerId",
        tier,
        COUNT(*) AS "lifetimeOrders",
        SUM("orderTotal") AS "lifetimeSpend",
        AVG("orderTotal") AS "averageOrderValue",
        MAX("createdAt") AS "lastOrderDate"
    FROM customer_orders
    GROUP BY "customerId", tier
),
ranked_customers AS (
    SELECT 
        "customerId",
        tier,
        "lifetimeOrders",
        "lifetimeSpend",
        "averageOrderValue",
        ROW_NUMBER() OVER (PARTITION BY tier ORDER BY "lifetimeSpend" DESC) AS "tierRank",
        CASE 
            WHEN "lifetimeSpend" >= 1000 THEN 'VIP_PLATINUM'
            WHEN "lifetimeSpend" >= 500 THEN 'GOLD_LOYAL'
            ELSE 'STANDARD'
        END AS "segment"
    FROM customer_metrics
)
SELECT 
    "customerId",
    tier,
    "segment",
    "tierRank",
    "lifetimeOrders",
    "lifetimeSpend",
    "averageOrderValue"
FROM ranked_customers
ORDER BY "lifetimeSpend" DESC;`;

export const ECOMMERCE_SAMPLE_ORDERS: DataRow[] = [
  { __rowId: 'ord_1', id: 'O-101', customerId: 'C-01', orderTotal: 250, orderStatus: 'DELIVERED', createdAt: '2026-10-10' },
  { __rowId: 'ord_2', id: 'O-102', customerId: 'C-01', orderTotal: 820, orderStatus: 'DELIVERED', createdAt: '2026-10-18' },
  { __rowId: 'ord_3', id: 'O-103', customerId: 'C-02', orderTotal: 120, orderStatus: 'CANCELLED', createdAt: '2026-10-15' },
  { __rowId: 'ord_4', id: 'O-104', customerId: 'C-02', orderTotal: 450, orderStatus: 'DELIVERED', createdAt: '2026-10-19' },
  { __rowId: 'ord_5', id: 'O-105', customerId: 'C-03', orderTotal: 1500, orderStatus: 'DELIVERED', createdAt: '2026-10-12' },
  { __rowId: 'ord_6', id: 'O-106', customerId: 'C-04', orderTotal: 85, orderStatus: 'DELIVERED', createdAt: '2026-10-17' },
];

export const ECOMMERCE_SAMPLE_CUSTOMERS: DataRow[] = [
  { __rowId: 'cust_1', id: 'C-01', tier: 'ENTERPRISE', countryCode: 'US' },
  { __rowId: 'cust_2', id: 'C-02', tier: 'PRO', countryCode: 'EG' },
  { __rowId: 'cust_3', id: 'C-03', tier: 'ENTERPRISE', countryCode: 'DE' },
  { __rowId: 'cust_4', id: 'C-04', tier: 'STARTER', countryCode: 'UK' },
];
