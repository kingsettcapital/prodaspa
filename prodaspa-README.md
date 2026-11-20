# prodaspa

The UI half of KingSett's **Proda Validation Platform** — where property managers generate
rent roll files and clean up tenant names before Anaplan gets them.

All the actual logic lives in the **`prodagateway`** repository, and so
does the documentation — start with its `README.md` and `HANDOVER.md`.

Angular 14

## Running it

```bash
npm install
ng serve
```

Runs on `http://localhost:4200`. **The API has to be running first** — start `prodagateway`
before this, or every page will fail to load data.

## Building

```bash
ng build --configuration dev        # or: uat | production
```

Each configuration picks up its own settings file, so a build points itself at the right API
automatically. Nothing needs editing by hand.

## Where things are

```
src/app/
├── core/services/        shared plumbing for talking to the API
├── auth/                 sign-in
└── features/
    ├── validation/       the validation page
    └── properties/       the property master page
```

---

*Full documentation: `prodagateway/README.md`

Thank You!
