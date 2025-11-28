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

### Basic Usage
```typescript
import { Validator } from "express-io-validator";
import * as t from "io-ts";

const { validate } = Validator();

const USER_CODEC = t.type({
  name: t.string,
  age: t.number,
});

app.post(
  "/users",
  validate(USER_CODEC, (req, res) => {
    // req.body is fully typed!
    // type User = { name: string, age: number }
    res.json({ name: req.body.name, age: req.body.age });
  })
);
```

### Union Types
```typescript
const USER_CODEC2 = t.union([
  t.type({
    name: t.string,
    age: t.number,
  }),
  t.type({
    info: t.type({
      gender: t.string,
      email: t.string,
    }),
  }),
]);

app.post(
  "/users2",
  validate(USER_CODEC2, (req, res) => {
    // type User = { name: string, age: number } | { info: { gender: string, email: string } }
    res.json(req.body);
  })
);
```

### Custom Error Handling
```typescript
const { validate } = Validator((error) => {
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