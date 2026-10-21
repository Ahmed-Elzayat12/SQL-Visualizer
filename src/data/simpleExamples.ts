import type { DataRow } from '../types/execution';

export const SIMPLE_EXAMPLES = {
  filter: { label: 'SQL ? Filter users', language: 'sql' as const, code: `SELECT id, name, age
FROM users
WHERE age >= 18
ORDER BY age;` },
  cte: { label: 'SQL ? One simple CTE', language: 'sql' as const, code: `WITH adults AS (
  SELECT id, name, age
  FROM users
  WHERE age >= 18
)
SELECT name, age FROM adults ORDER BY age;` },
  nest: { label: 'NestJS ? Simple query', language: 'typescript' as const, code: `@Injectable()
export class UsersService {
  constructor(private readonly dataSource: DataSource) {}

  async findAdults() {
    const minAge = 18;
    return this.dataSource.query(
      'SELECT id, name, age FROM users WHERE age >= $1 ORDER BY age',
      [minAge],
    );
  }
}` },
};

export const SIMPLE_TABLES: Record<string, DataRow[]> = {
  users: [
    { __rowId: 'users_1', id: 1, name: 'Ali', age: 16 },
    { __rowId: 'users_2', id: 2, name: 'Mona', age: 22 },
    { __rowId: 'users_3', id: 3, name: 'Omar', age: 18 },
    { __rowId: 'users_4', id: 4, name: 'Sara', age: 30 },
  ],
};
