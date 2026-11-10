# Sync prompt: bring argentw onto a new upstream argent release

You're running inside `argentw-upstream-sync.yml`. The workflow merged the upstream argent release tag named in `ARGENTW_UPSTREAM_TAG` into the branch `argentw/upstream-sync`. Read `argentw/PATCH.md` first. It lists every change argentw makes to upstream, and why.

The workflow gives the reason it called you in `ARGENTW_SYNC_REASON`:

- `conflicts`: the merge stopped with conflicts. `git diff --name-only --diff-filter=U` lists the files. Resolve each one so that upstream's change is kept and argentw's hook still does its job.
- `checks`: the merge was clean, but the build, the tests or `argentw/check.sh` failed afterwards. The output is in `$RUNNER_TEMP/argentw-precheck.log`. Most often upstream rewrote code that a hook sat in, and the hook needs to move into the new code.

## Rules

- Keep upstream's code and behavior. argentw changes only what `argentw/PATCH.md` lists. Never revert, drop or "simplify" an upstream change to make a hook fit. Move the hook instead.
- Keep each hook small and marked with an `argentw:` comment. New logic goes in argentw's own files (`*.argentw.ts`, `*+Argentw.swift`, `packages/update-core/src/argentw.ts`), not in upstream files.
- If upstream renamed or moved a hooked function, put the hook in its new home, and update `argentw/check.sh` and the table in `argentw/PATCH.md` to match.
- If upstream changed how the runner is reached (usbmux, the runner's HTTP server, how it's launched), or how updates are checked and installed, think about what argentw's patch has to do now, and make it work. Don't just make the text merge.
- If upstream added its own wireless support, stop. Don't merge argentw's patch on top of it. Write in your report what upstream now does and how it differs from argentw.
- Three upstream tests are deliberately changed (see `argentw/PATCH.md`). Keep their argentw expectations, and carry over any other changes upstream made to them.

## Before you finish

Run these from the repository root. All of them must pass:

```sh
npm ci
npm install @rollup/rollup-linux-x64-gnu --no-save
npm run build
npm test --workspaces --if-present
argentw/check.sh
argentw/build.sh
```

No conflict markers may remain (`git grep -nE '^(<<<<<<<|>>>>>>>) '`). Don't commit, push, check out or reset. The workflow does that.

Then write a short report to `$RUNNER_TEMP/argentw-report.md` for the pull request: what conflicted or broke, what you changed and why, and anything a human should check, such as a behavior change in how the iPhone is reached.
