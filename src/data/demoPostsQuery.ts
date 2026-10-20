import type { DataRow } from '../types/execution';

export const POSTS_RAW_SQL = `WITH published_posts AS (
    SELECT 
        p.id AS "postId",
        p."authorId",
        p.title,
        p."likeCount",
        p."viewCount",
        p."publishedAt"
    FROM posts p
    WHERE p.status = 'PUBLISHED' AND p."likeCount" >= 0
),
author_aggregates AS (
    SELECT 
        "authorId",
        COUNT(*) AS "totalPosts",
        SUM("likeCount") AS "totalLikes",
        SUM("viewCount") AS "totalViews",
        AVG("likeCount") AS "avgLikesPerPost"
    FROM published_posts
    GROUP BY "authorId"
),
author_profiles AS (
    SELECT 
        u.id AS "userId",
        u.username,
        u.role,
        a."totalPosts",
        a."totalLikes",
        a."totalViews",
        a."avgLikesPerPost",
        CASE 
            WHEN a."totalLikes" > 1000 THEN 'TOP_CREATOR'
            WHEN a."totalPosts" >= 5 THEN 'ACTIVE_WRITER'
            ELSE 'EMERGING'
        END AS "creatorBadge"
    FROM users u
    LEFT JOIN author_aggregates a ON u.id = a."authorId"
)
SELECT 
    "userId",
    username,
    role,
    "creatorBadge",
    "totalPosts",
    "totalLikes",
    "totalViews"
FROM author_profiles
ORDER BY "totalLikes" DESC NULLS LAST;`;

export const POSTS_SAMPLE_DATA: DataRow[] = [
  { __rowId: 'p_1', id: 'post-1', authorId: 'user-1', title: 'PostgreSQL Internals', likeCount: 420, viewCount: 3200, status: 'PUBLISHED', publishedAt: '2026-10-01' },
  { __rowId: 'p_2', id: 'post-2', authorId: 'user-1', title: 'Understanding CTEs', likeCount: 890, viewCount: 6500, status: 'PUBLISHED', publishedAt: '2026-10-05' },
  { __rowId: 'p_3', id: 'post-3', authorId: 'user-2', title: 'Draft Notes on NestJS', likeCount: 15, viewCount: 80, status: 'DRAFT', publishedAt: '2026-10-15' },
  { __rowId: 'p_4', id: 'post-4', authorId: 'user-2', title: 'TypeORM Migrations', likeCount: 110, viewCount: 950, status: 'PUBLISHED', publishedAt: '2026-10-12' },
];

export const USERS_SAMPLE_DATA: DataRow[] = [
  { __rowId: 'u_1', id: 'user-1', username: 'ahmed_dev', role: 'Staff Backend Engineer' },
  { __rowId: 'u_2', id: 'user-2', username: 'sarah_db', role: 'Senior Database Engineer' },
  { __rowId: 'u_3', id: 'user-3', username: 'omar_cloud', role: 'DevOps Lead' },
];
