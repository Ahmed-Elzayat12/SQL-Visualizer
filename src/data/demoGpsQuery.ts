import type { DataRow } from '../types/execution';

export const GPS_TS_CODE = `import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class VehicleTelemetryService {
  constructor(private readonly dataSource: DataSource) {}

  async getVehicleFleetHealth(tenantId: string, minConfidence: number = 0.8) {
    // Dynamic WHERE filter variables resolved by TypeScript
    const valid = 'pointCount > 0';
    const anomaly = "source != 'test'";
    const predicates = [valid, anomaly, 'windowEnd IS NOT NULL'];

    const query = \`
WITH filtered AS MATERIALIZED (
    SELECT 
        id,
        "vehicleId",
        source,
        "pointCount",
        "windowStart",
        "windowEnd",
        "receivedAt",
        "eventTime",
        ("pointCount" > 0) AS usable
    FROM reporting_vehicle_gps_track_batches
    WHERE \${predicates.join(' AND ')}
),
totals AS (
    SELECT 
        "vehicleId",
        COUNT(*) AS "batchCount",
        SUM("pointCount") AS "totalPoints",
        COUNT(*) FILTER (WHERE "pointCount" > 5) AS "denseBatches",
        MAX("windowEnd") AS "latestWindowEnd"
    FROM filtered
    GROUP BY "vehicleId"
),
latest_fix AS (
    SELECT DISTINCT ON ("vehicleId")
        "vehicleId",
        "eventTime" AS "latestEventTime",
        source AS "latestFixSource",
        "pointCount" AS "latestPointCount"
    FROM filtered
    ORDER BY "vehicleId", "eventTime" DESC
),
latest_receipt AS (
    SELECT DISTINCT ON ("vehicleId")
        "vehicleId",
        "receivedAt" AS "latestReceivedAt"
    FROM filtered
    ORDER BY "vehicleId", "receivedAt" DESC
),
labeled AS (
    SELECT 
        t."vehicleId",
        t."batchCount",
        t."totalPoints",
        t."denseBatches",
        f."latestEventTime",
        r."latestReceivedAt",
        f."latestFixSource",
        EXTRACT(EPOCH FROM (r."latestReceivedAt" - f."latestEventTime")) AS "driftSeconds",
        CASE 
            WHEN t."totalPoints" = 0 THEN 'NO_DATA'
            WHEN EXTRACT(EPOCH FROM (r."latestReceivedAt" - f."latestEventTime")) > 300 THEN 'CLOCK_DRIFT'
            WHEN t."denseBatches" = 0 THEN 'LOW_CONFIDENCE'
            ELSE 'HEALTHY'
        END AS "healthStatus"
    FROM totals t
    LEFT JOIN latest_fix f ON t."vehicleId" = f."vehicleId"
    LEFT JOIN latest_receipt r ON t."vehicleId" = r."vehicleId"
),
matched AS (
    SELECT 
        "vehicleId",
        "batchCount",
        "totalPoints",
        "latestEventTime",
        "driftSeconds",
        "healthStatus"
    FROM labeled
    WHERE "healthStatus" != 'NO_DATA'
),
statuses AS (
    SELECT 
        "healthStatus",
        COUNT(*) AS "vehicleCount",
        AVG("totalPoints") AS "avgPointsPerVehicle"
    FROM labeled
    GROUP BY "healthStatus"
),
sources AS (
    SELECT 
        f.source,
        COUNT(DISTINCT f."vehicleId") AS "activeVehicles",
        SUM(f."pointCount") AS "totalPointsTransmitted"
    FROM filtered f
    INNER JOIN matched m ON f."vehicleId" = m."vehicleId"
    GROUP BY f.source
)
SELECT 
    l."vehicleId",
    l."healthStatus",
    l."totalPoints",
    l."latestEventTime",
    l."latestFixSource",
    l."driftSeconds"
FROM labeled l
ORDER BY l."totalPoints" DESC;
    \`;

    return this.dataSource.query(query, [tenantId]);
  }
}
`;

export const GPS_RAW_SQL = `WITH filtered AS MATERIALIZED (
    SELECT 
        id,
        "vehicleId",
        source,
        "pointCount",
        "windowStart",
        "windowEnd",
        "receivedAt",
        "eventTime",
        ("pointCount" > 0) AS usable
    FROM reporting_vehicle_gps_track_batches
    WHERE pointCount > 0 AND source != 'test' AND windowEnd IS NOT NULL
),
totals AS (
    SELECT 
        "vehicleId",
        COUNT(*) AS "batchCount",
        SUM("pointCount") AS "totalPoints",
        COUNT(*) FILTER (WHERE "pointCount" > 5) AS "denseBatches",
        MAX("windowEnd") AS "latestWindowEnd"
    FROM filtered
    GROUP BY "vehicleId"
),
latest_fix AS (
    SELECT DISTINCT ON ("vehicleId")
        "vehicleId",
        "eventTime" AS "latestEventTime",
        source AS "latestFixSource",
        "pointCount" AS "latestPointCount"
    FROM filtered
    ORDER BY "vehicleId", "eventTime" DESC
),
latest_receipt AS (
    SELECT DISTINCT ON ("vehicleId")
        "vehicleId",
        "receivedAt" AS "latestReceivedAt"
    FROM filtered
    ORDER BY "vehicleId", "receivedAt" DESC
),
labeled AS (
    SELECT 
        t."vehicleId",
        t."batchCount",
        t."totalPoints",
        t."denseBatches",
        f."latestEventTime",
        r."latestReceivedAt",
        f."latestFixSource",
        EXTRACT(EPOCH FROM (r."latestReceivedAt" - f."latestEventTime")) AS "driftSeconds",
        CASE 
            WHEN t."totalPoints" = 0 THEN 'NO_DATA'
            WHEN EXTRACT(EPOCH FROM (r."latestReceivedAt" - f."latestEventTime")) > 300 THEN 'CLOCK_DRIFT'
            WHEN t."denseBatches" = 0 THEN 'LOW_CONFIDENCE'
            ELSE 'HEALTHY'
        END AS "healthStatus"
    FROM totals t
    LEFT JOIN latest_fix f ON t."vehicleId" = f."vehicleId"
    LEFT JOIN latest_receipt r ON t."vehicleId" = r."vehicleId"
),
matched AS (
    SELECT 
        "vehicleId",
        "batchCount",
        "totalPoints",
        "latestEventTime",
        "driftSeconds",
        "healthStatus"
    FROM labeled
    WHERE "healthStatus" != 'NO_DATA'
),
statuses AS (
    SELECT 
        "healthStatus",
        COUNT(*) AS "vehicleCount",
        AVG("totalPoints") AS "avgPointsPerVehicle"
    FROM labeled
    GROUP BY "healthStatus"
),
sources AS (
    SELECT 
        f.source,
        COUNT(DISTINCT f."vehicleId") AS "activeVehicles",
        SUM(f."pointCount") AS "totalPointsTransmitted"
    FROM filtered f
    INNER JOIN matched m ON f."vehicleId" = m."vehicleId"
    GROUP BY f.source
)
SELECT 
    l."vehicleId",
    l."healthStatus",
    l."totalPoints",
    l."latestEventTime",
    l."latestFixSource",
    l."driftSeconds"
FROM labeled l
ORDER BY l."totalPoints" DESC;`;

export const GPS_SAMPLE_DATA: DataRow[] = [
  // Vehicle 101: Fresh Healthy GPS, 3 batches
  {
    __rowId: 'batch_01',
    id: 'b-101-1',
    vehicleId: 'VEH-101',
    source: 'teltonika',
    pointCount: 12,
    windowStart: '2026-10-20T11:45:00Z',
    windowEnd: '2026-10-20T11:50:00Z',
    receivedAt: '2026-10-20T11:50:05Z',
    eventTime: '2026-10-20T11:50:00Z',
  },
  {
    __rowId: 'batch_02',
    id: 'b-101-2',
    vehicleId: 'VEH-101',
    source: 'teltonika',
    pointCount: 18,
    windowStart: '2026-10-20T11:50:00Z',
    windowEnd: '2026-10-20T11:55:00Z',
    receivedAt: '2026-10-20T11:55:04Z',
    eventTime: '2026-10-20T11:55:00Z',
  },
  {
    __rowId: 'batch_03',
    id: 'b-101-3',
    vehicleId: 'VEH-101',
    source: 'teltonika',
    pointCount: 8,
    windowStart: '2026-10-20T11:55:00Z',
    windowEnd: '2026-10-20T12:00:00Z',
    receivedAt: '2026-10-20T12:00:02Z',
    eventTime: '2026-10-20T12:00:00Z',
  },
  // Vehicle 102: Stale GPS with low batch count and high drift
  {
    __rowId: 'batch_04',
    id: 'b-102-1',
    vehicleId: 'VEH-102',
    source: 'queclink',
    pointCount: 4,
    windowStart: '2026-10-20T08:00:00Z',
    windowEnd: '2026-10-20T08:05:00Z',
    receivedAt: '2026-10-20T11:15:00Z', // 3 hours late!
    eventTime: '2026-10-20T08:05:00Z',
  },
  // Vehicle 103: Severe Clock Drift anomaly (> 300s)
  {
    __rowId: 'batch_05',
    id: 'b-103-1',
    vehicleId: 'VEH-103',
    source: 'calamp',
    pointCount: 9,
    windowStart: '2026-10-20T11:00:00Z',
    windowEnd: '2026-10-20T11:05:00Z',
    receivedAt: '2026-10-20T11:25:00Z', // 1200 seconds drift!
    eventTime: '2026-10-20T11:05:00Z',
  },
  // Vehicle 104: Corrupted batch with 0 points (should be filtered out by pointCount > 0!)
  {
    __rowId: 'batch_06',
    id: 'b-104-0',
    vehicleId: 'VEH-104',
    source: 'teltonika',
    pointCount: 0,
    windowStart: '2026-10-20T11:40:00Z',
    windowEnd: '2026-10-20T11:45:00Z',
    receivedAt: '2026-10-20T11:45:01Z',
    eventTime: '2026-10-20T11:45:00Z',
  },
  // Vehicle 105: Test environment record (should be filtered out by source != 'test'!)
  {
    __rowId: 'batch_07',
    id: 'b-test-1',
    vehicleId: 'VEH-TEST',
    source: 'test',
    pointCount: 50,
    windowStart: '2026-10-20T11:00:00Z',
    windowEnd: '2026-10-20T11:10:00Z',
    receivedAt: '2026-10-20T11:10:00Z',
    eventTime: '2026-10-20T11:10:00Z',
  },
  // Vehicle 106: Missing windowEnd (should be filtered out by windowEnd IS NOT NULL)
  {
    __rowId: 'batch_08',
    id: 'b-106-null',
    vehicleId: 'VEH-106',
    source: 'calamp',
    pointCount: 7,
    windowStart: '2026-10-20T11:30:00Z',
    windowEnd: null as any,
    receivedAt: '2026-10-20T11:35:00Z',
    eventTime: '2026-10-20T11:30:00Z',
  },
  // Vehicle 107: Second batch for VEH-102
  {
    __rowId: 'batch_09',
    id: 'b-102-2',
    vehicleId: 'VEH-102',
    source: 'queclink',
    pointCount: 6,
    windowStart: '2026-10-20T08:05:00Z',
    windowEnd: '2026-10-20T08:10:00Z',
    receivedAt: '2026-10-20T11:20:00Z',
    eventTime: '2026-10-20T08:10:00Z',
  },
];
