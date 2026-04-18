(() => {
  if (typeof navigator === 'undefined' || !navigator.modelContext) {
    return;
  }

  try {
    navigator.modelContext.registerTool({
      name: 'open_beans_mcp_docs',
      title: 'Open beans-mcp docs',
      description: 'Open beans-mcp documentation pages in this tab.',
      inputSchema: {
        type: 'object',
        properties: {
          section: {
            type: 'string',
            enum: ['getting-started', 'tools', 'development'],
            default: 'getting-started'
          }
        },
        additionalProperties: false
      },
      annotations: {
        readOnlyHint: true
      },
      execute: async input => {
        const section = input?.section ?? 'getting-started';
        const routes = {
          'getting-started': '/guide/getting-started',
          tools: '/tools/',
          development: '/development/architecture'
        };

        const targetPath = routes[section] ?? routes['getting-started'];
        const targetUrl = new URL(targetPath, globalThis.location.origin).toString();

        globalThis.location.assign(targetUrl);

        return {
          ok: true,
          url: targetUrl
        };
      }
    });
  } catch {
    // Ignore duplicate registration or unsupported runtime errors.
  }
})();
