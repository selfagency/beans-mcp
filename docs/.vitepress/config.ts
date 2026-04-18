import { defineConfig } from 'vitepress';

const SITE_URL = 'https://beans-mcp.self.agency';

export default defineConfig({
  title: 'beans-mcp',
  description:
    'MCP server for Beans issue tracker with workspace lifecycle, querying, file operations, and automation-friendly APIs.',
  lang: 'en-US',
  base: '/',

  sitemap: {
    hostname: SITE_URL,
  },

  head: [
    [
      'link',
      {
        rel: 'api-catalog',
        href: '/.well-known/api-catalog',
        type: 'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"',
      },
    ],
    ['link', { rel: 'service-desc', href: '/server.json', type: 'application/json' }],
    ['link', { rel: 'service-doc', href: '/guide/getting-started', type: 'text/html' }],
    ['link', { rel: 'describedby', href: '/.well-known/mcp/server-card.json', type: 'application/json' }],
    ['link', { rel: 'describedby', href: '/.well-known/oauth-protected-resource', type: 'application/json' }],
    ['link', { rel: 'describedby', href: '/.well-known/openid-configuration', type: 'application/json' }],
    ['link', { rel: 'mcp-server-card', href: '/.well-known/mcp/server-card.json', type: 'application/json' }],
    ['link', { rel: 'agent-skills', href: '/.well-known/agent-skills/index.json', type: 'application/json' }],
    ['meta', { name: 'content-signal', content: 'ai-train=no, search=yes, ai-input=yes' }],
    ['meta', { name: 'theme-color', content: '#0f172a' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'beans-mcp' }],
    ['meta', { property: 'og:url', content: SITE_URL }],
    [
      'meta',
      {
        property: 'og:description',
        content:
          'MCP server for Beans issue tracker with workspace lifecycle, querying, file operations, and automation-friendly APIs.',
      },
    ],
    [
      'script',
      {},
      `
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
            execute: async (input) => {
              const section = input?.section ?? 'getting-started';
              const routes = {
                'getting-started': '/guide/getting-started',
                tools: '/tools/',
                development: '/development/architecture'
              };

              const targetPath = routes[section] ?? routes['getting-started'];
              const targetUrl = new URL(targetPath, window.location.origin).toString();

              window.location.assign(targetUrl);

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
      `,
    ],
  ],

  themeConfig: {
    logo: '/logo.png',

    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Tools', link: '/tools/' },
      { text: 'Developer', link: '/development/architecture' },
      {
        text: 'v0.5.x',
        items: [
          { text: 'Changelog', link: 'https://github.com/selfagency/beans-mcp/releases' },
          { text: 'Contributing', link: '/development/contributing' },
        ],
      },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Guide',
          items: [
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'Configuration', link: '/guide/configuration' },
            { text: 'MCP Resources', link: '/guide/resources' },
            { text: 'Safety & Permissions', link: '/guide/safety' },
          ],
        },
      ],
      '/tools/': [
        {
          text: 'Tool Reference',
          items: [
            { text: 'Overview', link: '/tools/' },
            { text: 'Workspace & Query', link: '/tools/workspace' },
            { text: 'Mutations', link: '/tools/mutations' },
            { text: 'Bulk Operations', link: '/tools/bulk' },
            { text: 'Bean File Operations', link: '/tools/files' },
            { text: 'GraphQL Passthrough', link: '/tools/graphql' },
          ],
        },
      ],
      '/development/': [
        {
          text: 'Development',
          items: [
            { text: 'Architecture', link: '/development/architecture' },
            { text: 'Contributing', link: '/development/contributing' },
            { text: 'Testing', link: '/development/testing' },
          ],
        },
      ],
    },

    socialLinks: [{ icon: 'github', link: 'https://github.com/selfagency/beans-mcp' }],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2024-present Daniel Sieradski',
    },

    search: {
      provider: 'local',
    },

    editLink: {
      pattern: 'https://github.com/selfagency/beans-mcp/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },
  },
});
