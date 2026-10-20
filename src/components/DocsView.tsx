import React from 'react';
import { Database, Server, Cpu, Layers, GitBranch, Terminal, ShieldAlert } from 'lucide-react';

export const DocsView: React.FC = () => {
  return (
    <div className="w-full h-full flex flex-col bg-slate-950 text-slate-200 overflow-y-auto p-6 max-w-5xl mx-auto space-y-8">
      {/* Overview */}
      <div className="space-y-3">
        <h1 className="text-2xl font-bold tracking-tight text-white font-sans">
          QueryScope Architecture &amp; Engineering Constitution
        </h1>
        <p className="text-sm text-slate-400 leading-relaxed">
          QueryScope is an interactive SQL and TypeScript debugger and learning platform for backend engineers.
          Rather than relying on hallucinating LLMs for query execution, it is built on a 3-tier deterministic engine:
        </p>
      </div>

      {/* 3 Pillars */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
          <div className="p-2 w-fit rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Cpu className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-semibold text-white">1. Code Understanding</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Uses the TypeScript Compiler API AST parser to identify SQL template strings, resolve deterministic local constants, and isolate dynamic variables ($1, array joins) for user calibration.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
          <div className="p-2 w-fit rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Database className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-semibold text-white">2. SQL &amp; Execution Engine</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Parses PostgreSQL CTE dependencies, logical operators (WHERE, GROUP BY, DISTINCT ON, JOIN), and executes them in an in-memory relational sandbox to compute real intermediate tables.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
          <div className="p-2 w-fit rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <Layers className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-semibold text-white">3. Interactive Visualizer</h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Renders an interactive DAG via React Flow with synchronized Monaco Editor code highlights, step-by-step debugger playback, before/after table diffs, and bilingual explanations in English and Egyptian Arabic.
          </p>
        </div>
      </div>

      {/* Docker Compose Section */}
      <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <h2 className="text-sm font-semibold text-white">
            Optional Local PostgreSQL Lab Environment (Docker Compose)
          </h2>
        </div>
        <p className="text-xs text-slate-400">
          To run a dedicated, isolated PostgreSQL 17 lab with seeded telemetry tables locally:
        </p>

        <pre className="p-4 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs text-emerald-400 overflow-x-auto">
{`# docker-compose.yml
version: '3.8'

services:
  queryscope-postgres:
    image: postgres:17-alpine
    container_name: queryscope-pg-lab
    environment:
      POSTGRES_USER: queryscope
      POSTGRES_PASSWORD: secretpassword
      POSTGRES_DB: queryscope_telemetry
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./init-scripts:/docker-entrypoint-initdb.d:ro

volumes:
  pgdata:`}
        </pre>
      </div>

      {/* Security & Isolation */}
      <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-2 text-xs text-slate-400">
        <div className="flex items-center gap-2 text-amber-400 font-semibold">
          <ShieldAlert className="w-4 h-4" />
          <span>Security &amp; Sandboxing Guarantee</span>
        </div>
        <p>
          QueryScope never calls `eval()` or unconstrained execution on pasted JavaScript or TypeScript. Dynamic template expressions are parsed via AST tokenization. All query transformations are evaluated within a bounded in-memory relational sandbox.
        </p>
      </div>
    </div>
  );
};
