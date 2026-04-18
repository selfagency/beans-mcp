export function createDistPackage(rootPkg) {
  const { name, version, description, keywords, homepage, bugs, issues, repository, license, author, mcpName } =
    rootPkg;

  return {
    name,
    version,
    description,
    keywords,
    homepage,
    bugs,
    issues,
    repository,
    license,
    author,
    main: './index.cjs',
    module: './index.js',
    types: './index.d.ts',
    files: ['index.cjs', 'index.js', 'index.d.ts', 'beans-mcp-server.cjs', 'skills', 'skills-lock.json'],
    bin: {
      'beans-mcp': 'beans-mcp-server.cjs',
    },
    exports: {
      '.': {
        import: './index.js',
        require: './index.cjs',
      },
    },
    mcpName,
  };
}
