# Security Policy

## Supported versions

Only the latest release gets security fixes. Clipy updates itself, so make
sure automatic update checks are on (Settings → General).

| Version | Supported |
| ------- | --------- |
| 2.x     | Yes       |
| 1.x     | No        |

## Reporting a vulnerability

Please report vulnerabilities privately through
[GitHub security advisories](https://github.com/BankkRoll/clipy/security/advisories/new),
not in public issues.

Include what you found, how to reproduce it, and the Clipy version and OS.
You'll get a reply as soon as possible. Once a fix ships you'll be credited
in the advisory unless you'd rather not be.

## Verifying releases

Every release asset is listed in `SHA256SUMS.txt` and has a signed
build-provenance attestation:

```bash
gh attestation verify <file> --repo BankkRoll/clipy
```

In-app updates are verified against Clipy's update signing key before they
are installed.
