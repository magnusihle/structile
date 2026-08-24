# Security policy

## Reporting

Do not open public issues for suspected vulnerabilities. Until a dedicated disclosure address is established, use GitHub private vulnerability reporting for this repository and contact the repository owner through the verified profile channel.

Never include secrets, tokens, customer data, screenshots containing customer data, exploit payloads against third parties, or production connection details in a report.

## Supported state

Structile is currently a G0/v0.1 bootstrap and is not production-certified. No release is supported for customer production use until the protected release gates say otherwise.

## Security boundary

The public repository contains no production credentials or customer configuration. Requirements, protected tests, evidence policy, agent authority, and release signing are controlled separately. See `docs/security-threat-model.md` in the canonical planning repository (<https://github.com/magnusihle/structile-planning>) for the normative threat model.
