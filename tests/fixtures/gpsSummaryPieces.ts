/** Full days/hours use projections; only incomplete boundary hours read raw. */
export function gpsSummaryPieces(
  rawPredicates: string[],
  scopePredicates: string[],
): string {
  const dayOf = (value: string): string =>
    `(date_trunc('day',${value} AT TIME ZONE 'Asia/Riyadh') AT TIME ZONE 'Asia/Riyadh')`;
  const hourOf = (value: string): string =>
    `(date_trunc('hour',${value}::timestamptz AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')`;
  return `pieces AS MATERIALIZED (
    SELECT "vehicleId",source,state FROM gps_summary_buckets
    WHERE ${scopePredicates.length ? scopePredicates.join(' AND ') + ' AND ' : ''} (
      (kind='day' AND bucket >= $1::timestamptz AND bucket+interval '24 hours' <= $2::timestamptz)
      OR (kind='hour' AND bucket >= $1::timestamptz AND bucket+interval '1 hour' <= $2::timestamptz
        AND NOT (${dayOf('bucket')} >= $1::timestamptz
          AND ${dayOf('bucket')}+interval '24 hours' <= $2::timestamptz)))
  ), filtered AS MATERIALIZED (
    SELECT "vehicleId",source,
      (state->>'batchCount')::bigint AS "batchCount",(state->>'pointCount')::bigint AS "pointCount",
      (state->>'validLocationBatchCount')::bigint AS "validLocationBatchCount",
      (state->>'invalidLocationBatchCount')::bigint AS "invalidLocationBatchCount",
      (state->>'clockAnomalyBatchCount')::bigint AS "clockAnomalyBatchCount",
      (state#>>'{fix,time}')::timestamptz AS "windowEnd",
      (state->>'reported')::timestamptz AS "reportedSource",
      (state#>>'{fix,receipt}')::timestamptz AS "fixReceivedAt",
      (state#>>'{fix,delay}')::double precision AS "fixDelay",
      state#>>'{fix,id}' AS id,state#>>'{receipt,id}' AS "receiptId",
      (state#>>'{receipt,time}')::timestamptz AS "receivedAt",
      (state#>>'{receipt,published}')::timestamptz AS "eventTime",
      (state#>>'{receipt,delay}')::double precision AS "receiptDelay"
    FROM pieces
    UNION ALL
    SELECT b."vehicleId",b.source::text,1::bigint,GREATEST(b."pointCount",0)::bigint,
      CASE WHEN q.usable THEN 1 ELSE 0 END::bigint,
      CASE WHEN q.usable THEN 0 ELSE 1 END::bigint,
      CASE WHEN (b."windowEnd">b."receivedAt" OR b."clockAnomaly" IS TRUE) IS TRUE THEN 1 ELSE 0 END::bigint,
      CASE WHEN q.usable THEN b."windowEnd" END,b."windowEnd",
      CASE WHEN q.usable THEN b."receivedAt" END,
      CASE WHEN q.usable THEN extract(epoch FROM b."receivedAt"-b."windowEnd")::double precision END,
      CASE WHEN q.usable THEN b.id::text END,b.id::text,b."receivedAt",b."eventTime",
      extract(epoch FROM b."receivedAt"-b."windowEnd")::double precision
    FROM reporting_vehicle_gps_track_batches b
    CROSS JOIN LATERAL (SELECT (b."pointCount">0 AND b."windowStart" IS NOT NULL AND b."windowEnd" IS NOT NULL
      AND b."windowStart"<=b."windowEnd" AND b."windowEnd"<=b."receivedAt" AND b."clockAnomaly" IS NOT TRUE) IS TRUE AS usable) q
    WHERE ${rawPredicates.join(' AND ')}
      AND (($1::timestamptz<>${hourOf('$1')} AND b."receivedAt" < ${hourOf('$1')}+interval '1 hour')
        OR ($2::timestamptz<>${hourOf('$2')} AND b."receivedAt" >= ${hourOf('$2')}))
  )`;
}
