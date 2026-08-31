# Security policy

## Supported versions

The latest minor release receives security fixes. Pre-release and older minor versions may be asked to upgrade before a fix is provided.

| Version | Supported |
| --- | --- |
| 0.1.x | Yes |
| Earlier versions | No |

## Report a vulnerability

Use [GitHub's private vulnerability reporting](https://github.com/ddoug220/kyle-reese/security/advisories/new). Do not include exploit details in a public issue.

Include:

- the affected version;
- the operating system and Node.js version;
- a minimal reproduction;
- the security impact;
- any known workaround.

The maintainers will review the report and coordinate valid fixes privately before disclosure. Acknowledgement does not mean that a report qualifies as a vulnerability.

## Sensitive areas

Fix mode writes source files and runs a caller-supplied verification command. Treat untrusted configuration and repositories as untrusted code. Review `kyle-reese.config.json` before running fix mode, and do not run a verification command you would not run directly.
