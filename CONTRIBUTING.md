# Contributing to beans-mcp-server

Thank you for your interest in contributing to the Beans MCP server! This document provides guidelines and instructions for contributing.

## Development Setup

### Prerequisites

- Node.js 18+
- pnpm 9+
- Beans CLI installed and in PATH (or specify via `--cli-path`)

### Getting Started

1. Clone the repository
2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Build the project:

   ```bash
   pnpm build
   ```

4. Run tests:

   ```bash
   pnpm test
   ```

## Development Workflow

### Running Tests

```bash
# Run all tests
pnpm test

# Run specific test file
pnpm test src/test/utils.test.ts

# Run with coverage
pnpm test --coverage
```

### Building

The project uses `tsup` for bundling:

```bash
# Build all formats (ESM, CJS, CLI)
pnpm build

# Watch mode (development)
pnpm build --watch
```

Build outputs:

- `dist/index.js` - ESM entry point
- `dist/index.cjs` - CommonJS entry point
- `dist/beans-mcp-server.cjs` - CLI executable (with shebang)
- `dist/index.d.ts` - TypeScript type definitions

### Code Style

- Use TypeScript for all source code
- Format with Prettier (configured in project)
- Lint with ESLint
- Follow existing patterns in the codebase

### Testing Requirements

- All changes should include tests
- Use Vitest for unit tests
- Tests should use Arrange-Act-Assert pattern
- Aim for high test coverage

## Architecture

### Project Structure

```text
src/
├── index.ts              # Public API exports
├── cli.ts                # CLI entry point
├── types.ts              # TypeScript types and constants
├── utils.ts              # Utility functions
├── server/
│   ├── BeansMcpServer.ts # Main MCP server implementation
│   └── backend.ts        # Backend interface and Beans CLI backend
├── internal/
│   ├── graphql.ts        # GraphQL queries/mutations
│   └── queryHelpers.ts   # Query and sorting utilities
└── test/
    ├── utils.test.ts
    └── parseCliArgs.test.ts
```

### Key Modules

- **BeansMcpServer.ts**: Main server class that manages MCP tools and backend interaction
- **backend.ts**: Interface for backend implementations; includes BeansCliBackend that wraps Beans CLI
- **graphql.ts**: GraphQL queries and mutations for bean operations
- **queryHelpers.ts**: Sorting, filtering, and query handling utilities

## Submitting Changes

1. Create a feature branch from `main`
2. Make your changes with clear, atomic commits
3. Add or update tests as needed
4. Run `pnpm test` to ensure all tests pass
5. Run `pnpm build` to verify the build succeeds
6. Submit a pull request with a clear description

## Pull Request Guidelines

- Include a clear description of what changed and why
- Reference any related issues
- Ensure all tests pass
- Update documentation if needed
- Keep commits focused and atomic

## Reporting Issues

When reporting bugs, please include:

- Steps to reproduce
- Expected behavior
- Actual behavior
- Node.js and pnpm versions
- Relevant error messages or logs

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
