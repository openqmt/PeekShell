# Hosts

Open the host list from the sidebar to manage SSH connections by group.

## Add a connection

Provide:

- **Name** — alias shown in the list
- **Host** — IP or domain
- **Port** — default `22`
- **Username**
- **Group** (optional)
- **Notes** (optional)

Choose one auth method:

| Method | Fields |
| --- | --- |
| Password | Login password |
| Public key | Private key path, optional passphrase |

Credentials are stored in the OS keychain whenever possible, not as plaintext config.

## Groups

Create, rename, and delete groups. When deleting a group, follow the prompt for hosts inside it.

## Connect

Pick a host and connect. On success, a terminal tab opens in the center workspace, and the left panel shows system and resource info for that host.
