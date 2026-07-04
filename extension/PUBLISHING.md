# Publishing the DevFlow extension

The extension id is **`ivogia.devflow-plugin`** (`publisher` + `name` in
[package.json](package.json)). Build once, then publish to the two registries.

## 0. Build & package a `.vsix`

```bash
cd extension
npm install
npm run package        # runs vscode:prepublish (bundles CLI + esbuild) then vsce package
# -> produces devflow-plugin-0.2.0.vsix
```

Test locally before publishing:

```bash
code --install-extension devflow-plugin-0.2.0.vsix     # VS Code
cursor --install-extension devflow-plugin-0.2.0.vsix   # Cursor (if CLI available)
```

## 1. Visual Studio Marketplace (VS Code, Copilot)

Requires a free Microsoft + Azure DevOps account. One-time setup:

1. Create/sign in to a **Microsoft account**.
2. Create an **Azure DevOps** organization at <https://dev.azure.com>.
3. Create a **Personal Access Token (PAT)**:
   - Azure DevOps -> User settings -> Personal access tokens -> New Token.
   - Organization: **All accessible organizations**.
   - Scopes: **Custom defined -> Marketplace -> Manage**.
   - Copy the token (shown once).
4. Create a **publisher** at <https://marketplace.visualstudio.com/manage>:
   - Publisher ID must be **`ivogia`** (must match `package.json`).
5. Log in and publish:

```bash
cd extension
npx @vscode/vsce login ivogia        # paste the PAT
npm run publish:vsce                  # or: npx @vscode/vsce publish --no-dependencies
```

Result: installable via `code --install-extension ivogia.devflow-plugin` and via
the VS Code Extensions panel.

## 2. Open VSX (Cursor, VSCodium, Gitpod)

Cursor does not use the MS Marketplace; it uses Open VSX. One-time setup:

1. Sign in at <https://open-vsx.org> using an **Eclipse Foundation account**.
2. Sign the **Eclipse Publisher Agreement** (open-vsx.org -> user settings).
3. Create an **Access Token** (open-vsx.org -> Settings -> Access Tokens).
4. Create the namespace (once) and publish:

```bash
cd extension
npx ovsx create-namespace ivogia -p <OPEN_VSX_TOKEN>
npm run publish:ovsx -- -p <OPEN_VSX_TOKEN>
# or: npx ovsx publish devflow-plugin-0.2.0.vsix -p <OPEN_VSX_TOKEN>
```

Result: searchable as "DevFlow" in Cursor's Extensions panel.

## 3. Releasing a new version

1. Bump `version` in [package.json](package.json) and update [CHANGELOG.md](CHANGELOG.md).
2. `npm run package` and test the `.vsix`.
3. `npm run publish:vsce` and `npm run publish:ovsx`.
4. Tag and attach the `.vsix` to a GitHub release.

## Notes

- `--no-dependencies` is used because the runtime code is fully bundled by
  esbuild + the bundled CLI; there are no production `node_modules` to ship.
- The icon is `media/icon.png` (square). The Activity Bar uses `media/icon.svg`.
