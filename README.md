# express-io-validator

Type-safe Express middleware for runtime request validation using [io-ts](https://github.com/gcanti/io-ts) schemas. Provides full TypeScript type inference with zero boilerplate and customizable error handling.

## Features

- 🔒 **Type-safe**: Full TypeScript inference from io-ts schemas
- ⚡ **Zero boilerplate**: Simple middleware integration
- 🎯 **Runtime validation**: Catch invalid data at runtime
- 🔧 **Customizable**: Flexible error handling with default formatter
- 📦 **Functional**: Built on fp-ts Either for type-safe error handling
- 🚀 **Express 5 ready**: Compatible with Express 5.x

## Installation

```bash
npm install express-io-validator
```

or

```bash
yarn add express-io-validator
```

### Peer Dependencies

This package requires the following peer dependencies:

- `express` (^5.0.0)
- `io-ts` (^2.2.0)
- `fp-ts` (^2.16.0)

Install them if you haven't already:

```bash
npm install express io-ts fp-ts
```

## Quick Start

### Validating Request Body
```typescript
import { Validator } from "express-io-validator";
import * as t from "io-ts";

const { validateBody } = Validator();

const USER_CODEC = t.type({
  name: t.string,
  age: t.number,
});

app.post(
  "/users",
  validateBody(USER_CODEC, (req, res) => {
    // req.body is fully typed!
    // type User = { name: string, age: number }
    res.json({ name: req.body.name, age: req.body.age });
  })
);
```

### Validating Query Parameters
```typescript
const { validateQuery } = Validator();

const QUERY_CODEC = t.type({
  name: t.string,
  age: t.number,
});

app.get(
  "/users",
  ...validateQuery(QUERY_CODEC, (req, res) => {
    // Typed query params available in res.locals.typedQuery
    res.json({
      name: res.locals.typedQuery.name,
      age: res.locals.typedQuery.age,
    });
  })
);
```

### Validating Route Parameters
```typescript
const { validateParams } = Validator();

const PARAMS_CODEC = t.type({
  id: t.number,
});

app.get(
  "/users/:id",
  validateParams(PARAMS_CODEC, (req, res) => {
    // req.params is fully typed!
    res.json({ id: req.params.id });
  })
);
```

### Combined Validation (Query, Params, and Body)
```typescript
const { validate } = Validator();

const QUERY_CODEC = t.type({ name: t.string });
const PARAMS_CODEC = t.type({ id: t.number });
const BODY_CODEC = t.type({ email: t.string });

app.post(
  "/users/:id",
  ...validate(
    {
      query: QUERY_CODEC,
      params: PARAMS_CODEC,
      body: BODY_CODEC,
    },
    (req, res) => {
      // All validated data available in res.locals
      res.json({
        query: res.locals.typedQuery,
        params: res.locals.typedParams,
        body: res.locals.typedBody,
      });
    }
  )
);
```

### Optional Validation
All validation functions support optional schemas. If a schema is not
provided, validation is skipped:

```typescript
// Only validate body, skip query and params
...validate(
  {
    body: BODY_CODEC,
    // query and params are optional
  },
  handler
);
```

### Custom Error Handling
```typescript
const { validateBody, validateQuery, validateParams, validate } =
  Validator((error) => {
    return {
      errors: error.flatMap((err) => {
        return err.context.map((c) => ({
          key: c.key,
          expected: c.type?.name,
          actual: c.actual ?? "undefined",
          message: "something went wrong",
        }));
      }),
    };
  });
```