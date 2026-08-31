# Releasing kyle-reese

This procedure creates a GitHub release and attaches an installable npm tarball. Publishing to npm is a separate, explicit action.

## Prepare a release

1. Move the relevant entries in `CHANGELOG.md` from `Unreleased` to a dated version section.
2. Set the same version in `package.json` and `package-lock.json`:

   ```sh
   npm version <major|minor|patch> --no-git-tag-version
   ```

3. Run the full local check:

   ```sh
   npm ci
   npm run verify
   ```

4. Commit the version and changelog changes.
5. Create and push an annotated `vX.Y.Z` tag.
6. Create a GitHub release from that tag and paste the matching changelog section into the release notes.

The `Release package` workflow reruns verification, builds `kyle-reese-X.Y.Z.tgz`, and attaches the tarball to the release.

## Publish to npm later

The package is not automatically published to npm. Before the first publish, confirm that the `kyle-reese` name is available and that the repository owner controls the intended npm account. Then follow npm's current trusted publishing or provenance guidance.
