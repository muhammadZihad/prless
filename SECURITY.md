# Security Policy

## Local-only design

PRless runs on your local machine and reads your local git diff. It binds its server to
`127.0.0.1` only and makes no outbound network calls. It does not intentionally send source
code, diffs, comments, or review data to any external service. The only data that leaves
PRless is whatever you choose to paste into your AI agent.

Comments and exports are stored under `.prless/` in the repository you are reviewing.

## Reporting a vulnerability

If you find a security issue, please report it privately rather than opening a public issue:

- Open a [GitHub security advisory](https://github.com/muhammadZihad/prless/security/advisories/new), or
- Contact the maintainer directly.

Please do not disclose the issue publicly until it has been reviewed and addressed.

## Supported versions

PRless is pre-1.0. Security fixes are applied to the latest published version on npm.
