# SPA Closed Deals Phase 0 — read-only audit

Repo: `C:\Projects\Prod_2\prodaspa`. Branch recorded in Q0.

Closed Deals string in `src/`: **NOT FOUND**.

---

## Q0 — Tree state

Commands run from `C:\Projects\Prod_2\prodaspa`. Output recorded verbatim.

`git rev-parse --abbrev-ref HEAD`

```
develop
```

`git status --porcelain`

```
```

(empty — no modified, untracked, or staged paths at audit start)

`git log --oneline -5`

```
39459c8 Add execution doctrine rule file
fe1c8a3 allow accept/override on backfilled parent rows
bc5995b Minor bug fix
9932169 Placed the clear all button back to its original place
64b186b Relabel and relocate Clear File to a single batch-level Clear All Files control
```

HEAD is `develop`. Audit continues.

Modified or untracked files at Step 0: **none**.

Uncommitted upload-bar / remove-file changeset in the working tree: **no**. Evidence: `git status --porcelain` empty. `removeValidatedFile` exists in committed `validation.component.ts:349` and is bound in committed `validation.component.html:185`; that is HEAD, not an uncommitted diff.

---

## Q1 — Review section component structure

### Component files that render the review area

| Path | Role |
|---|---|
| `src/app/features/validation/validation.module.ts` | Declares review components; route `{ path: '', component: ValidationComponent }` at lines 7–9. |
| `src/app/app-routing.module.ts:23-24` | Lazy-loads that module at path `validate`. |
| `src/app/features/validation/validation.component.ts` | File cards, field toggle, bucket headers, bulk actions, draft/download. |
| `src/app/features/validation/validation.component.html` | Template for file cards, `mat-button-toggle-group`, `fieldBucketsTpl`, table host. |
| `src/app/features/validation/validation.component.scss` | File-card / bucket header styles including `bucket-header--new/flagged/suggested/correct` at 970–1009. |
| `src/app/features/validation/validation-result-table.component.ts` | Shared row table; `@Input() fieldType` and `@Input() bucket`. |
| `src/app/features/validation/validation-result-table.component.html` | Single table; `*ngFor="let row of rows"`. |
| `src/app/features/validation/validation-result-table.component.scss` | Table-local styles. |
| `src/app/features/validation/validation-table-shared.scss` | Shared row border classes `row-border--new/flagged/suggested/correct` at 47–59. |
| `src/app/features/validation/override-popover-panel.component.ts` | Override editor overlay; no section type of its own. |
| `src/app/features/validation/override-popover-panel.component.html` | Override inputs. |
| `src/app/features/validation/models/validation.models.ts` | Response/row/payload types. |
| `src/app/features/validation/services/validation-api.service.ts` | HTTP. |

`fieldGroupsFor` (`validation.component.ts:575-583`) and `toggleFieldGroup` / `isFieldGroupExpanded` (`510-527`) exist in TypeScript. Template bindings to those three names: **NOT FOUND** in `validation.component.html`.

### Tenant vs Parent: one shared block driven by a section variable

Answer: **(c)** one template block driven by `FieldType`, not two hand-duplicated review trees, and not two simultaneous instances.

Deciding template lines (`validation.component.html:154-225, 227-338`):

```154:173:src/app/features/validation/validation.component.html
            <mat-button-toggle-group
              *ngIf="isFileExpanded(fileIndex) && hasParentResponse(fileIndex)"
              class="field-toggle"
              [value]="activeFieldType(fileIndex)"
              (change)="onFieldToggleChange(fileIndex, $event)"
              ...
              <mat-button-toggle value="tenant"> Tenant names (...) </mat-button-toggle>
              <mat-button-toggle value="parent"> Parent names (...) </mat-button-toggle>
```

```223:225:src/app/features/validation/validation.component.html
          <ng-container
            *ngTemplateOutlet="fieldBucketsTpl; context: { fileIndex: fileIndex, fieldGroup: fieldGroupConfig(activeFieldType(fileIndex)) }"
          ></ng-container>
```

One `ng-template #fieldBucketsTpl` (`227-338`) loops `displayBuckets` and hosts one `<app-validation-result-table>` with `[fieldType]="fieldGroup.type"`. `fieldGroupConfig` (`validation.component.ts:585-589`) returns tenant or parent labels from that same `FieldType`.

### Switch mechanism

`mat-button-toggle-group` + `*ngIf` + `*ngTemplateOutlet`. Not `*ngSwitch`, not a routed child.

- Toggle shown only when `isFileExpanded(fileIndex) && hasParentResponse(fileIndex)` (`html:155`).
- `hasParentResponse` is `this.batchResults[fileIndex]?.parentResponse != null` (`validation.component.ts:550-551`).
- Active value: `activeFieldType` (`591-595`) reads `activeFieldTabByFile` keyed by `fileId`, default `'tenant'`, forced to `'tenant'` unless `hasParentResponse`.
- Change: `onFieldToggleChange` (`597-599`) maps `event.value === 'parent' ? 'parent' : 'tenant'`.
- Parent-copy gate inside the shared template: `*ngIf="fieldGroup.type === 'parent' && isParentCopyPending(fileIndex)"` (`html:230`); buckets `*ngIf="fieldGroup.type !== 'parent' || !isParentCopyPending(fileIndex)"` (`html:254`).

Parent-copy prompt HTML (`228-252`) is the only Tenant/Parent-specific block inside `fieldBucketsTpl`. Bucket table markup is not duplicated.

### Types / enums / unions / literals that enumerate sections today

**`FieldType`** — `validation-result-table.component.ts:9`, full contents:

```
export type FieldType = 'tenant' | 'parent';
```

**`ALL_FIELD_TYPES`** — `validation.component.ts:77`, full contents:

```
const ALL_FIELD_TYPES: readonly FieldType[] = ['tenant', 'parent'];
```

**`StoredCorrectionRecord.fieldType`** — `validation.component.ts:54`:

```
fieldType: 'Tenant' | 'Parent';
```

(`setCorrection` maps `'tenant'` → `'Tenant'`, `'parent'` → `'Parent'` at `1434`.)

**`BucketKey`** — `validation-result-table.component.ts:10`, full contents:

```
export type BucketKey = 'new' | 'flagged' | 'suggested' | 'excluded';
```

**`ALL_BUCKET_KEYS`** — `validation.component.ts:78`:

```
const ALL_BUCKET_KEYS: readonly BucketKey[] = ['new', 'flagged', 'suggested', 'excluded'];
```

**`ClassifyStatus`** — `validation.models.ts:1`:

```
export type ClassifyStatus = 'correct' | 'suggested' | 'flagged' | 'new';
```

**`FrontendStatus`** — `validation.models.ts:2`:

```
export type FrontendStatus = 'excluded' | 'suggested' | 'flagged' | 'new';
```

**`displayBuckets`** — `validation.component.ts:203-207` (visible bucket keys, not a type):

```
{ key: 'new', ... },
{ key: 'suggested', ... },
{ key: 'excluded', ... }
```

No third section string exists in these unions. Closed Deals identifiers: **NOT FOUND**.

---

## Q2 — Bucket construction

### Response models and fields

`ValidationResult` `validation.models.ts:6-23`: `rowIndex`, `propertyId`, `unitId`, `tenantName`, `targetName`, `buildingName`, `leaseStart`, `status`, `classifyStatus`, `suggestion`, `matchSource`, `suggestedName`, `confidence`, `reason`, `isAmbiguousMultiParty?`, `appliesTo`.

`ValidationResponse` `validation.models.ts:25-32`: `total`, `excluded`, `suggested`, `flagged`, `new`, `results`.

[BELIEF] `ValidationResponse` carries a `New` counter: **DISCREPANCY**. Live field is `new` (`validation.models.ts:30`), not `New`.

[BELIEF] backend returns FOUR statuses: **UNKNOWN** from this repo (no captured `validate-batch` body). SPA types encode four `FrontendStatus` values and four `ClassifyStatus` values (`validation.models.ts:1-2`). `status` on rows is typed `FrontendStatus` (`14`, `47`). Whether the HTTP JSON uses those four strings at runtime is not established here.

`ParentValidationResult` `validation.models.ts:39-57`: same row fields as `ValidationResult` plus `isBackfilledFromTenant?`.

`ParentValidationResponse` `validation.models.ts:59-67`: `total`, `excluded`, `suggested`, `flagged`, `new`, `isCopiedFromTenant?`, `results`.

`BatchValidationResult` `validation.models.ts:69-75`: `fileName`, `fileId`, `historyId`, `response`, `parentResponse`.

HTTP assignment: `validate()` `validation.component.ts:453-464` sets `this.batchResults = results` from `validateBatch`.

### Every place a bucket array is built or filtered

1. `rowsForBucket` `validation.component.ts:826-852` — `result.response.results.filter(r => r.status === bucket)` for tenant (`843-844`); else `parentResponse.results.filter(r => r.status === bucket)` (`845-848`). Cached in `rowsForBucketCache`.
2. `rowsForDisplayBucket` `864-886` — if `key === 'suggested'`, concatenates suggested+flagged then `filter(r => !this.isVacantRow(r))` (`876-880`); else `rowsForBucket(...).filter(r => !this.isVacantRow(r))` (`882`).
3. `isVacantRow` `855-861` — `reason` trim/lower `=== 'blank / vacant'`, or `tenantName` empty / `=== 'VACANT'` after trim/`toUpperCase`.
4. `rowsForSearchedDisplayBucket` `893-916` — filters display bucket by `matchesSearch` (`928-943`).
5. `rowsForPagedDisplayBucket` `705-726` — `slice` of searched display bucket.
6. `onSearchTermChange` `803-824` — invalidates searched/paged cache; does not rebuild source results.
7. Template `html:258` `*ngFor="let bucket of displayBuckets"`; table `[rows]="rowsForPagedDisplayBucket(...)"` `html:315`.

`response.total` / `response.new` / `response.suggested` / `response.flagged` / `response.excluded` (and parent equivalents) as inputs to those filters: **NOT FOUND**. History table reads `ValidationHistory` counters separately (`html:500-504`).

### Once vs change detection vs component state

`batchResults` is component state (`validation.component.ts:148`). Bucket arrays are derived on call and stored in `rowsForBucketCache` (`184`) until `clearRowsForBucketCache` (`946-947`), per-file `deleteKeysForFile` (`391`), or searched/paged invalidation (`774-793`). Not rebuilt on every change-detection pass if the cache hits (`832-834`, `870-872`).

### Tenant vs Parent arrays

Separate source arrays: `response.results` vs `parentResponse.results`. Partition is at `rowsForBucket` by `fieldType` (`843-848`), not at render. Render uses whichever `FieldType` is active.

### Bulk actions: unfiltered vs display-filtered

Template comment `html:218`: “bulk actions still apply to all”. `searchTermByFile` comment `validation.component.ts:160`: “View-only: bulk actions ignore it.” `rowsForPagedDisplayBucket` comment `702-704`: full-bucket consumers must not use the page slice.

| Call | file:line | Array read |
|---|---|---|
| `executeApplyAllSuggestions` | `1310-1314` | `rowsForDisplayBucket(..., 'suggested')` — not search-filtered; vacant-filtered; flagged folded in |
| `executeAcceptAllAsIs` | `1326-1333` | `rowsForDisplayBucket(..., 'new')` — not search-filtered; vacant-filtered |
| `executeStandardiseAll` | `1318-1322` | `rowsForBucket(..., 'flagged')` — not search-filtered; vacant **not** stripped |
| `rowsApplicableSuggestions` / `applyAllSuggestionsCount` | `1256-1265` | `rowsForDisplayBucket(..., 'suggested')` |
| `acceptAsIsEligibleCount` | `1202-1208` | `rowsForDisplayBucket(..., 'new')` |
| `ambiguousNewRows` | `1211-1213` | `rowsForDisplayBucket(..., 'new')` |
| `rowsAlignableToMaster` / `autoStageForField` | `1268-1306` | `rowsForBucket(..., 'excluded')` |
| Table rows | `html:315` | `rowsForPagedDisplayBucket` — search- and page-filtered |

`requestBulkAction` HTML (`html:282, 296`) passes `'apply-all'` and `'accept-as-is'` only. `'standardise'` is a `BulkActionType` (`validation.component.ts:80`) and `confirmBulkAction` case (`1177-1178`). Template call with `'standardise'`: **NOT FOUND**.

---

## Q3 — Status handling and the unrecognised-status hole

### Belief checks

[BELIEF] compared/switched status strings are `correct`, `suggested`, `flagged`, `new`, `excluded`.

**DISCREPANCY** on `correct` as a live `row.status` comparison: **NOT FOUND** in production TS/HTML. `correct` exists only on `ClassifyStatus` (`validation.models.ts:1`). Runtime bucket filters use `row.status === bucket` against `BucketKey` (`826-848`). `classifyStatus` is never read in `validation.component.ts` or `validation-result-table.component.ts` (only assigned in specs).

Live status/bucket string sites (validation feature, excluding HTTP numeric `error.status` and draft `InProgress`):

| file:line | Comparison |
|---|---|
| `validation.component.ts:844` | `r.status === bucket` (strict, case-sensitive) |
| `validation.component.ts:848` | `r.status === bucket` (strict, case-sensitive) |
| `validation.component.ts:876` | `key === 'suggested'` |
| `validation.component.ts:878-879` | `rowsForBucket(..., 'suggested')` / `'flagged'` |
| `validation.component.ts:1113` | `row.status?.toLowerCase() === 'new'` |
| `validation.component.ts:1262` | display bucket `'suggested'` |
| `validation.component.ts:1270` | `rowsForBucket(..., 'excluded')` |
| `validation.component.ts:1311` | display bucket `'suggested'` |
| `validation.component.ts:1319` | `rowsForBucket(..., 'flagged')` |
| `validation.component.ts:1321` | `row.reason === 'Standardisation'` (reason, not status) |
| `validation.component.ts:1329` | display bucket `'new'` |
| `validation.component.html:275` | `bucket.key === 'suggested'` |
| `validation.component.html:289` | `bucket.key === 'new'` |
| `validation-result-table.component.ts:50-57` | `switch (this.bucket)` `excluded` / `flagged` / `suggested` / `new` |
| `validation-result-table.component.ts:79` | `this.bucket !== 'excluded'` |
| `validation-result-table.component.ts:139` | `row.status?.toLowerCase() === 'new'` |
| `validation-result-table.component.ts:163, 182, 188, 191, 194, 201, 211, 214, 217` | `this.bucket === 'excluded'|'suggested'|'new'|'flagged'` |
| `validation-result-table.component.html:27` | `*ngIf="bucket === 'excluded'"` |
| `validation-result-table.component.html:42` | `*ngIf="bucket !== 'excluded'"` |

Pipes dedicated to status: **NOT FOUND** (`src` `*pipe*` glob empty). CSS does not branch on `row.status`; it applies classes chosen from `bucket` (`rowBorderClass` `validation-result-table.component.ts:211-220`; classes in `validation-table-shared.scss:47-59`). Route guards: **NOT FOUND** for these strings.

[BELIEF] visible sections are new / suggested / excluded only, and `flagged` is folded into Suggested around `validation.component.ts:876-879`.

**Confirmed** for the review file card: `displayBuckets` keys are `new`, `suggested`, `excluded` (`203-207`); fold is `876-879`. `bucket-header--flagged` exists in SCSS (`validation.component.scss:983`) but no `displayBuckets` entry uses `headerClass: 'bucket-header--flagged'`. History table still shows a Flagged column from `h.flagged` (`html:494, 504`) — a different surface, not the review buckets.

[BELIEF] a status matching no bucket is NOT RENDERED — the row vanishes.

**Confirmed** for the review tables, with an additional vacant drop that also hides matching statuses.

Path for a row whose `status` equals none of `'new'|'suggested'|'flagged'|'excluded'`:

1. `rowsForBucket` keeps it only when `r.status === bucket` (`844`/`848`). No `else` / default bucket.
2. `displayBuckets` iteration (`html:258`) never calls `rowsForBucket` with an unknown key.
3. `flagged` is only admitted when building the display key `'suggested'` (`876-879`).
4. Table `*ngFor` is over the `rows` input (`validation-result-table.component.html:15`), which is the paged display slice (`html:315`). There is no second loop over `response.results`.

Therefore an unmatched `status` never enters `rows` and is not rendered. Empty bucket copy: `validation-result-table.component.html:76` `*ngIf="rows.length === 0"` → “No rows in this bucket.”

Same drop for vacant rows that **do** match a status: `rowsForDisplayBucket` filters `!isVacantRow` (`880`, `882`) before render and before `bucketCount`.

### Case sensitivity and operator

Bucket membership: `===`, case-sensitive (`844`, `848`). Accept-as-is: `toLowerCase() === 'new'` (`1113`, table `139`). **DISCREPANCY** between those two styles on the same `status` field.

### Header count vs rendered array

`bucketCount` `validation.component.ts:950-951` returns `this.rowsForDisplayBucket(...).length`.

Tab totals `fieldGroupRowCount` `612-616` sum `bucketCount` over `displayBuckets`.

Rendered table is `rowsForPagedDisplayBucket` → `rowsForSearchedDisplayBucket` → `rowsForDisplayBucket` (`705-722`).

Header count and render share `rowsForDisplayBucket`. They diverge when search or paging applies: header stays at full display-bucket length (`html:270` `bucketCount`); table shows the searched page (`html:315`); search subtitle shows searched vs display lengths (`html:306-308`).

Backend `ValidationResponse` counters are **not** the header source (**NOT FOUND** as cited in Q2). A dropped unmatched-status row is omitted from both header and table. A vacant row with a recognised status is omitted from both header and table. A search miss is omitted from the table (and paginator length) but still included in `bucketCount`.

---

## Q4 — Draft save and replay path

[BELIEF] Replay lives in the SPA (`resumeDraft`), not the gateway, and walks `tenantCorrections` / `parentCorrections` by `rowIndex`.

**Confirmed** for the SPA: `resumeDraft` `validation.component.ts:2051-2146` is the only resume implementation in this repo. Gateway replay: **UNKNOWN** (out of repo). Match is `r.rowIndex === d.rowIndex` (`2090`, `2105`).

### Save path

1. Manual: `saveDraft(fileIndex)` `1490-1523`.
2. Autosave: `flushAutosaveById` `1746+` calls `saveDraft` or `updateDraftDecisions` (`1815-1825` region).
3. Payload: `buildDownloadPayload(fileIndex)` `1641-1675` → `DownloadCorrectionsPayload` (`validation.models.ts:109-114`): `fileId`, `tenantCorrections`, `parentCorrections`, `copyTenantToParent`.
4. `tenantCorrections` from `correctionsMatchingFileId` records with `fieldType === 'Tenant'` (`1644-1655`); `parentCorrections` with `fieldType === 'Parent'` (`1656-1666`).
5. `resultsJson = JSON.stringify(batchResult)` (`1502`) — full `BatchValidationResult`.
6. `decisionsJson = JSON.stringify(payload)` (`1503`).
7. HTTP: `ValidationApiService.saveDraft` `validation-api.service.ts:75-94` posts FormData `file` + `draftJson` `{ fileId, fileName, resultsJson, decisionsJson }` to `Validation/save-draft`.
8. Decision-only: `updateDraftDecisions` `105-114` PATCH `{ decisionsJson }` to `Validation/draft/{fileId}/decisions`.

`StoredCorrectionRecord` fields serialised into those correction items: `rowIndex`, names, `changeType`, `confidence`, `matchSource`, plus tenant `unitId`/`building` from `correctionTargets` or parent `appliesTo` (`1646-1666`).

### Replay path

1. UI `html:105` `(click)="resumeDraft(d.fileId)"`.
2. `resumeDraft` `2051` optional confirm if `batchResults.length > 0 || corrections.size > 0` (`2052-2058`).
3. `validationApi.getDraft(fileId)` `2061` → `DraftDetail` (`validation.models.ts:138-149`).
4. Decode `fileBase64` to `File` (`2068-2074`).
5. `batchResult = JSON.parse(detail.resultsJson) as BatchValidationResult` (`2075`).
6. `decisions = JSON.parse(detail.decisionsJson) as DownloadCorrectionsPayload` (`2076`).
7. `resetResultsState()`; `selectedFiles = [file]`; `batchResults = [batchResult]` (`2082-2084`).
8. For each `decisions.tenantCorrections`: find in `batchResults[0].response.results` (`2088-2100`).
9. For each `decisions.parentCorrections`: find in `batchResults[0].parentResponse?.results` (`2103-2115`).
10. Hits call `setCorrection(0, 'tenant'|'parent', row, ...)`.
11. Misses append `tenant:${d.originalName}` / `parent:${d.originalName}` to `skipped` and `console.warn` (`2135-2139`).
12. `autoAlignApplied = true` (`2120`) — skips `autoStageAlignments`.
13. Restores autosave persisted flags and expands the file (`2121-2133`).

### Match key (verbatim)

Tenant: `r.rowIndex === d.rowIndex` (`validation.component.ts:2090`).

Parent: `r.rowIndex === d.rowIndex` (`validation.component.ts:2105`).

Array.find returns the first match. No `unitId` / `building` / `originalName` in the find predicate.

### Section discriminator in the match

The find expressions themselves have **no** section field. Tenant vs Parent are distinguished by **which array is searched** (`response.results` vs `parentResponse.results`) and **which decisions list is iterated**. A tenant row and a parent row with the same `rowIndex` can both restore. Two tenant rows with the same `rowIndex` are not distinguishable; the first wins. A Closed Deals row stuffed into `tenantCorrections` would match the first tenant result with that `rowIndex`.

### Unknown extra collection on the payload type

`JSON.parse(...) as DownloadCorrectionsPayload` (`2076`) is a compile-time assertion. Extra JSON properties are not stripped and do not throw. `resumeDraft` never reads a third collection. An extra `closedDealsCorrections` (or any other key) would be ignored. Throw only if `resultsJson` / `decisionsJson` / base64 decode fails (`2077-2079`).

---

## Q5 — fileIndex vs fileId state

`resolveFileId` **exists** at `validation.component.ts:645-646`:

```
return this.batchResults[fileIndex]?.fileId ?? null;
```

It **is called** from (non-exhaustive of every line, all in `validation.component.ts`): `removeValidatedFile:350`, `toggleFile:487`, `isFileExpanded:501`, `isAutosaveWarning:506`, `fieldGroupExpandKey:620`, `sectionExpandKey:625`, `pageStateKey:630`, `onBucketPage:689`, `rowsForPagedDisplayBucket:710`, `searchTermFor:799`, `onSearchTermChange:804`, `rowsForBucket:827`, `rowsForDisplayBucket:865`, `rowsForSearchedDisplayBucket:904`, `bucketCount` via display path, `acceptedCount:955`, `tableKeyPrefix:1100`, `requestBulkAction:1146`, `correctionKey:1413`, `correctionsForFile:1634`, `buildDownloadPayload:1642`, `ensureAutosaveState:1679`, `activeFieldType:592`, `setActiveFieldTab:603`, `isParentCopyPending:558`, `confirmParentCopy:563`, and others in the same file. Spec coverage of fileId-follow-after-splice: `validation.component.spec.ts:94-399`.

| Structure | file:line | Keyed by | Tier |
|---|---|---|---|
| `corrections` | `162`; key built `1411-1417` | `fileId` in `${fileId}\|${scope}\|${row.rowIndex}` (`scope` `tenant`/`parent`); unresolved fallback `__unresolved:${fileIndex}\|...` | 1 |
| `parentCopyConfirmed` | `554` | `fileId` (Set) | 1 (parent-copy decision) |
| `autosave` | `166` | `fileId` | 1/2 (dirty, timers, persisted) |
| `autosaveWarningIds` | `168` | `fileId` | 2 |
| `draftSaveState` | `164` | `fileId` | 2 |
| `downloadProgressByFile` | `163` | `fileId` | 2 |
| `downloadTimers` | `143` | `fileId` | 2 |
| `downloadSubscriptions` | `144` | `fileId` | 2 |
| `downloadGeneration` | `145` | `fileId` | 2 |
| `expandedFiles` | `153` | `fileId` | 2 |
| `expandedFieldGroups` | `154`; key `619-621` | `${fileId}-group-${fieldType}` | 2 |
| `expandedSections` | `155`; key `624-626` | `${fileId}-${fieldType}-${bucket}` | 2 |
| `activeFieldTabByFile` | `157` | `fileId` → `FieldType` | 2 |
| `bucketPageState` | `159`; key `629-634` | `${fileId}\|${fieldType}\|${bucket}` | 2 |
| `searchTermByFile` | `161` | `fileId` | 2 |
| `correctionMapCache` / `correctionMapCacheVersion` | `178-179` | `tableCacheKey` = `${fileId}\|${fieldType}` (`1035-1040`) | 2 |
| `changeTypeMapCache` / version | `180-181` | same `tableCacheKey` | 2 |
| `acceptedKeysCache` / version | `182-183` | same `tableCacheKey` | 2 |
| `rowsForBucketCache` | `184`; keys `756-760`, `736` | `fileId` + `fieldType` + bucket (+ page/search prefixes) | 2 |
| `pendingOverride.fileId` | `42`, `1057+` | `fileId` field on the pending object | 2 |
| `pendingBulkAction.fileId` | `83-84` | `fileId` | 2 |
| `pendingAmbiguousNotice.fileId` | `90` | `fileId` | 2 |
| `selectedFiles` / `batchResults` | `147-148` | array index = `fileIndex` | positional handles |
| `AutosaveState` timers | `31-32` | stored on autosave entry keyed by `fileId` | 2 |

Under the current design:

- `corrections` is **one** Map with a `tenant`/`parent` token in the key, not two Maps. A third section would be a third token in that same Map **or** a collision if `'tenant'`/`'parent'` were reused. There is no Closed Deals token today.
- `BatchValidationResult` has two result payloads: `response` and `parentResponse` (`validation.models.ts:73-74`). There is no third payload field.
- `FieldType` / `ALL_FIELD_TYPES` / `StoredCorrectionRecord.fieldType` are two-valued.
- `parentCopyConfirmed` is parent-copy-only.

---

## Q6 — API surface

[BELIEF] `validation-api.service.ts:34` posts only `Validation/validate-batch`: **confirmed for that method**. The same class defines additional endpoints below.

[BELIEF] `validation.component.ts:453` `validate()` calls `validateBatch`: **confirmed** (`453`, `462`).

All SPA calls through `ValidationApiService` / `ValidationComponent`:

| Endpoint | Definition | Call site | Request | Response type |
|---|---|---|---|---|
| `POST Validation/validate-batch` | `validation-api.service.ts:30-37` | `validation.component.ts:462` | `FormData` `files` | `BatchValidationResult[]` |
| `POST Validation/download-corrected` | `40-51` | `1574-1575` | `FormData` `file` + `correctionsJson` (`DownloadCorrectionsPayload`) | `Blob` |
| `GET Validation/history` | `54-58` | `2152` | none | `ValidationHistory[]` |
| `GET Validation/drafts` | `61-65` | `1996` | none | `DraftSummary[]` |
| `GET Validation/draft/{fileId}` | `68-72` | `2061` | none | `DraftDetail` |
| `POST Validation/save-draft` | `75-94` | `1505-1506`, `1818+` | `FormData` `file` + `draftJson` `{fileId,fileName,resultsJson,decisionsJson}` | `{ fileId, id, status }` |
| `POST Validation/draft/{fileId}/discard` | `97-103` | `2016` | `{}` | `{ fileId, status }` |
| `PATCH Validation/draft/{fileId}/decisions` | `105-114` | `1824-1825` | `{ decisionsJson }` | `{ fileId, status }` |
| `POST Validation/draft/{fileId}/clear` | `116-122` | `339`, `408` | `null` | `{ fileId, status }` |

Call sites whose TypeScript contract has no Closed Deals slot (would have to change or extra JSON would be ignored as in Q4):

- `validateBatch` / `BatchValidationResult` (`response` + `parentResponse` only).
- `downloadCorrected` / `DownloadCorrectionsPayload` (`tenantCorrections` + `parentCorrections` only).
- `saveDraft` / `updateDraftDecisions` / `getDraft` `decisionsJson` parsed as `DownloadCorrectionsPayload`; `resultsJson` as `BatchValidationResult`.

`ValidationHistory` (`validation.models.ts:77-86`) fields: `id`, `fileId`, `fileName`, `uploadedAt`, `total`, `excluded`, `suggested`, `flagged`. No `new`. No Closed Deals fields.

---

## Q7 — Change surface

| Area | Files touched | Files created | Existing tests covering it | Risk to the two live sections |
|---|---|---|---|---|
| Field toggle + shared `fieldBucketsTpl` + `FieldType` | `validation.component.ts`, `validation.component.html`, `validation-result-table.component.ts` | none in HEAD | `validation.component.spec.ts:201-211` (tab follows `fileId`); table specs do not cover the toggle | Same template and `FieldType` union drive Tenant and Parent; a third value or a second outlet shares that code path |
| Batch/row models | `validation.models.ts` | none | Specs construct `ValidationResponse` / `ParentValidationResponse` (`validation.component.spec.ts:39-53`, `57-66`) | `BatchValidationResult` is the `validate-batch` and draft `resultsJson` shape for both sections |
| Bucket filter, flagged fold, vacant drop, counts | `validation.component.ts:826-951` | none | **NOT FOUND** (no spec asserts `rowsForDisplayBucket` fold or `isVacantRow`) | One function pair serves both `fieldType`s; a change to `=== bucket`, fold, or vacant filter changes both |
| Shared result table | `validation-result-table.component.ts`, `.html`, `.scss`, `validation-table-shared.scss` | none | `validation-result-table.component.spec.ts` (parent `isAcceptDisabled` T5–T10) | One component instance per active tab; `@Input() fieldType` is `'tenant' \| 'parent'` |
| Corrections map + download payload | `validation.component.ts` `corrections`, `buildDownloadPayload:1641-1675`; `validation.models.ts:109-114` | none | `validation.component.spec.ts:131-161`, `304-318` | Single Map and payload builder split only by `Tenant`/`Parent`; download of either section uses this path |
| Draft save / `resumeDraft` | `validation.component.ts:1490-1523`, `1746-1825`, `2051-2146`; `validation-api.service.ts` draft methods | none | fileId autosave specs `240-299`, `363-378`; resume match itself **NOT FOUND** as a spec | Replay writes the same `corrections` Map Tenant/Parent use; `JSON.parse as DownloadCorrectionsPayload` ignores unknown keys |
| fileId session maps listed in Q5 | `validation.component.ts` | none | `validation.component.spec.ts:94-399` (remove-file / fileId follow) | Maps are keyed by `fileId` plus `FieldType`; widening `FieldType` or cache key format is shared |
| `validate-batch` HTTP | `validation-api.service.ts:30-37`; `validate():453-484` | none | **NOT FOUND** (component specs stub the API) | Replaces `batchResults` wholesale (`464`); both sections come from that array |
| Parent-copy prompt | `html:228-252`; `isParentCopyPending:556-559` | none | `spec.ts:164-175`, `336-359` | Gated on `fieldGroup.type === 'parent'`; Tenant buckets do not use this block |
| History table | `html:486-508`; `ValidationHistory` | none | **NOT FOUND** | Separate from review buckets; uses `excluded`/`suggested`/`flagged` only |

---

## Consolidated DISCREPANCY and UNKNOWN

**DISCREPANCY**

- [BELIEF] `ValidationResponse` `New` vs live `new` (`validation.models.ts:30`).
- [BELIEF] `correct` is among compared `row.status` strings. Live review filters never compare `row.status` to `'correct'`. `correct` is a `ClassifyStatus` only; `classifyStatus` is unused in production component/table TS.
- Accept-as-is uses `status?.toLowerCase() === 'new'` (`1113`, table `139`); bucket membership uses case-sensitive `===` (`844`, `848`).

**UNKNOWN**

- Whether live `validate-batch` JSON actually contains four status strings (SPA types claim four `FrontendStatus` / four `ClassifyStatus`; no response fixture in this repo).
- Whether the gateway performs any draft replay (SPA `resumeDraft` is the only replay in this repo).
- Whether `executeStandardiseAll` is reachable from any UI other than `confirmBulkAction` with `type === 'standardise'` (no template binding found).
- Runtime contents of `resultsJson` / `decisionsJson` stored on the server (only the SPA serialize/parse path is visible).

PHASE 0 AUDIT COMPLETE — NO FILES MODIFIED
