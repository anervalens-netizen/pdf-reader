# Third-party notices

## Folio — OpenAI Sign in with ChatGPT OAuth integration

The file \`src/main/chatgpt.ts\` adapts code from
[Forward-Future/folio](https://github.com/Forward-Future/folio),
\`electron/ai.cjs\`, commit \`99d31311237c5bfd50aa339f1892b150e8372b6f\`,
Copyright (c) the Folio contributors.

Original project is distributed under the MIT License. See
https://github.com/Forward-Future/folio/blob/main/LICENSE
for the original source. The license is copied to licenses/Folio-MIT.txt.

This implementation retains only the ChatGPT provider. It has been modified
to use this application's Electron IPC and client UI. It does not copy or
access ChatGPT conversations.
