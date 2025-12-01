import { NextFunction, Request, Response } from "express";
import * as t from "io-ts";
import assert from "node:assert";
import { describe, test } from "node:test";
import {
  validateBody,
  validateQuery,
  validateParams,
  validate,
  validatedRoute,
  Validator,
} from "../src/index.js";

// Mock Express types
type MockRequest = Partial<Request> & {
  body: any;
  query: any;
  params: any;
};

type MockResponse = Partial<Response> & {
  statusCode: number;
  jsonData: any;
  locals: any;
  status: (code: number) => MockResponse;
  json: (data: any) => MockResponse;
};

type MockNextFunction = NextFunction & {
  called: boolean;
  error: any;
};

function createMockRequest(body?: any, query?: any, params?: any): MockRequest {
  return {
    body: body ?? {},
    query: query ?? {},
    params: params ?? {},
  };
}

function createMockResponse(): MockResponse {
  const res: MockResponse = {
    statusCode: 200,
    jsonData: null,
    locals: {},
    status: function (code: number) {
      this.statusCode = code;
      return this;
    },
    json: function (data: any) {
      this.jsonData = data;
      return this;
    },
  };
  return res;
}

function createMockNext(): MockNextFunction {
  const next = ((err?: any) => {
    (next as MockNextFunction).called = true;
    (next as MockNextFunction).error = err;
  }) as MockNextFunction;
  next.called = false;
  next.error = null;
  return next;
}

describe("validate middleware", () => {
  test("should pass validation for valid data", () => {
    const schema = t.type({
      name: t.string,
      age: t.number,
    });

    const req = createMockRequest({ name: "John", age: 30 });
    const res = createMockResponse();
    const next = createMockNext();

    validateBody(schema)(req as Request, res as Response, next);

    assert.strictEqual(next.called, true);
    assert.strictEqual(next.error, undefined);
    assert.strictEqual(req.body.name, "John");
    assert.strictEqual(req.body.age, 30);
    assert.strictEqual(res.statusCode, 200);
  });

  test("should reject validation for invalid data", () => {
    const schema = t.type({
      name: t.string,
      age: t.number,
    });

    const req = createMockRequest({ name: "John", age: "30" });
    const res = createMockResponse();
    const next = createMockNext();

    validateBody(schema)(req as Request, res as Response, next);

    assert.strictEqual(next.called, false);
    assert.strictEqual(res.statusCode, 400);
    assert.ok(res.jsonData);
    assert.ok(res.jsonData.errors);
  });

  test("should use custom error handler when provided", () => {
    const schema = t.type({
      name: t.string,
      age: t.number,
    });

    const customErrorHandler = (errors: t.Errors) => {
      return { custom: "error", count: errors.length };
    };

    const req = createMockRequest({ name: "John", age: "30" });
    const res = createMockResponse();
    const next = createMockNext();

    validateBody(schema, customErrorHandler)(
      req as Request,
      res as Response,
      next
    );

    assert.strictEqual(next.called, false);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.jsonData.custom, "error");
    assert.strictEqual(res.jsonData.count, 1);
  });

  test("should handle nested objects", () => {
    const schema = t.type({
      user: t.type({
        name: t.string,
        age: t.number,
      }),
    });

    const req = createMockRequest({ user: { name: "John", age: 30 } });
    const res = createMockResponse();
    const next = createMockNext();

    validateBody(schema)(req as Request, res as Response, next);

    assert.strictEqual(next.called, true);
    assert.strictEqual(req.body.user.name, "John");
    assert.strictEqual(req.body.user.age, 30);
  });

  test("should handle arrays", () => {
    const schema = t.type({
      items: t.array(t.string),
    });

    const req = createMockRequest({ items: ["a", "b", "c"] });
    const res = createMockResponse();
    const next = createMockNext();

    validateBody(schema)(req as Request, res as Response, next);

    assert.strictEqual(next.called, true);
    assert.deepStrictEqual(req.body.items, ["a", "b", "c"]);
  });

  test("should handle optional fields", () => {
    const schema = t.type({
      name: t.string,
      age: t.union([t.number, t.undefined]),
    });

    const req = createMockRequest({ name: "John" });
    const res = createMockResponse();
    const next = createMockNext();

    validateBody(schema)(req as Request, res as Response, next);

    assert.strictEqual(next.called, true);
    assert.strictEqual(req.body.name, "John");
  });

  test("should handle union types", () => {
    const schema = t.union([
      t.type({ type: t.literal("A"), value: t.string }),
      t.type({ type: t.literal("B"), value: t.number }),
    ]);

    const req = createMockRequest({ type: "A", value: "test" });
    const res = createMockResponse();
    const next = createMockNext();

    validateBody(schema)(req as Request, res as Response, next);

    assert.strictEqual(next.called, true);
    assert.strictEqual(req.body.type, "A");
    assert.strictEqual(req.body.value, "test");
  });

  test("should handle empty body", () => {
    const schema = t.type({
      name: t.string,
    });

    const req = createMockRequest({});
    const res = createMockResponse();
    const next = createMockNext();

    validateBody(schema)(req as Request, res as Response, next);

    assert.strictEqual(next.called, false);
    assert.strictEqual(res.statusCode, 400);
  });

  test("should skip validation when schema is undefined", () => {
    const req = createMockRequest({ name: "John", age: "invalid" });
    const res = createMockResponse();
    const next = createMockNext();

    validateBody(undefined)(req as Request, res as Response, next);

    assert.strictEqual(next.called, true);
    assert.strictEqual(res.statusCode, 200);
  });
});

describe("validatedRoute", () => {
  test("should return array with middleware and handler", () => {
    const schema = t.type({
      name: t.string,
    });

    const handler = (req: any, res: Response) => {
      res.json({ success: true });
    };

    const route = validatedRoute(schema, handler);

    assert.strictEqual(Array.isArray(route), true);
    assert.strictEqual(route.length, 2);
    assert.strictEqual(typeof route[0], "function");
    assert.strictEqual(typeof route[1], "function");
  });

  test("should execute handler after successful validation", async () => {
    const schema = t.type({
      name: t.string,
      age: t.number,
    });

    let handlerCalled = false;
    let handlerBody: any = null;

    const handler = (req: any, res: Response) => {
      handlerCalled = true;
      handlerBody = req.body;
      res.json({ success: true });
    };

    const [middleware, routeHandler] = validatedRoute(schema, handler);

    const req = createMockRequest({ name: "John", age: 30 });
    const res = createMockResponse();
    const next = createMockNext();

    middleware(req as Request, res as Response, next);
    assert.strictEqual(next.called, true);

    await (routeHandler as (req: Request, res: Response) => Promise<void>)(
      req as Request,
      res as Response
    );

    assert.strictEqual(handlerCalled, true);
    assert.strictEqual(handlerBody.name, "John");
    assert.strictEqual(handlerBody.age, 30);
  });

  test("should not execute handler if validation fails", () => {
    const schema = t.type({
      name: t.string,
    });

    let handlerCalled = false;

    const handler = (req: any, res: Response) => {
      handlerCalled = true;
      res.json({ success: true });
    };

    const [middleware] = validatedRoute(schema, handler);

    const req = createMockRequest({ name: 123 });
    const res = createMockResponse();
    const next = createMockNext();

    middleware(req as Request, res as Response, next);

    assert.strictEqual(next.called, false);
    assert.strictEqual(handlerCalled, false);
    assert.strictEqual(res.statusCode, 400);
  });
});

describe("Validator factory", () => {
  test("should create validator with default error handler", () => {
    const validator = Validator();
    const schema = t.type({
      name: t.string,
    });

    const req = createMockRequest({ name: 123 });
    const res = createMockResponse();
    const next = createMockNext();

    const [middleware] = validator.validateBody(schema, () => {});

    middleware(req as Request, res as Response, next);

    assert.strictEqual(next.called, false);
    assert.strictEqual(res.statusCode, 400);
    assert.ok(Array.isArray(res.jsonData));
    assert.ok(res.jsonData.length > 0);
    assert.ok(res.jsonData[0].key);
    assert.ok(res.jsonData[0].expected);
    assert.ok(res.jsonData[0].actual);
    assert.ok(res.jsonData[0].message);
  });

  test("should create validator with custom error handler", () => {
    const customErrorHandler = (errors: t.Errors) => {
      return { message: "Validation failed", errors: errors.length };
    };

    const validator = Validator(customErrorHandler);
    const schema = t.type({
      name: t.string,
    });

    const req = createMockRequest({ name: 123 });
    const res = createMockResponse();
    const next = createMockNext();

    const [middleware] = validator.validateBody(schema, () => {});

    middleware(req as Request, res as Response, next);

    assert.strictEqual(next.called, false);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.jsonData.message, "Validation failed");
    assert.strictEqual(res.jsonData.errors, 1);
  });

  test("should work with validatedRoute pattern", async () => {
    const validator = Validator();
    const schema = t.type({
      name: t.string,
      age: t.number,
    });

    let handlerCalled = false;

    const [middleware, handler] = validator.validateBody(schema, (req, res) => {
      handlerCalled = true;
      res.json({ name: req.body.name, age: req.body.age });
    });

    const req = createMockRequest({ name: "John", age: 30 });
    const res = createMockResponse();
    const next = createMockNext();

    middleware(req as Request, res as Response, next);
    assert.strictEqual(next.called, true);

    await (handler as (req: Request, res: Response) => Promise<void>)(
      req as Request,
      res as Response
    );

    assert.strictEqual(handlerCalled, true);
    assert.strictEqual(res.jsonData.name, "John");
    assert.strictEqual(res.jsonData.age, 30);
  });

  test("should work with validateQuery", async () => {
    const validator = Validator();
    const schema = t.type({
      name: t.string,
      age: t.string,
    });

    let handlerCalled = false;

    const [middleware, handler] = validator.validateQuery(schema, (req, res) => {
      handlerCalled = true;
      res.json({
        name: res.locals.typedQuery.name,
        age: res.locals.typedQuery.age,
      });
    });

    const req = createMockRequest(undefined, { name: "John", age: "30" });
    const res = createMockResponse();
    const next = createMockNext();

    middleware(req as Request, res as any, next);
    assert.strictEqual(next.called, true);

    await (handler as (req: Request, res: Response) => Promise<void>)(
      req as Request,
      res as any
    );

    assert.strictEqual(handlerCalled, true);
    assert.strictEqual(res.jsonData.name, "John");
    assert.strictEqual(res.jsonData.age, "30");
  });

  test("should work with validateParams", async () => {
    const validator = Validator();
    const schema = t.type({
      id: t.string,
    });

    let handlerCalled = false;

    const [middleware, handler] = validator.validateParams(schema, (req, res) => {
      handlerCalled = true;
      res.json({ id: req.params.id });
    });

    const req = createMockRequest(undefined, undefined, { id: "123" });
    const res = createMockResponse();
    const next = createMockNext();

    middleware(req as any, res as any, next);
    assert.strictEqual(next.called, true);

    await (handler as (req: Request, res: Response) => Promise<void>)(
      req as Request,
      res as Response
    );

    assert.strictEqual(handlerCalled, true);
    assert.strictEqual(res.jsonData.id, "123");
  });
});

describe("default error handler", () => {
  test("should format errors correctly", () => {
    const validator = Validator();
    const schema = t.type({
      name: t.string,
      age: t.number,
      email: t.string,
    });

    const req = createMockRequest({
      name: 123,
      age: "not a number",
      email: "valid@email.com",
    });
    const res = createMockResponse();
    const next = createMockNext();

    const [middleware] = validator.validateBody(schema, () => {});
    middleware(req as Request, res as Response, next);

    assert.strictEqual(res.statusCode, 400);
    assert.ok(Array.isArray(res.jsonData));
    assert.ok(res.jsonData.length >= 2);

    const nameError = res.jsonData.find((e: any) => e.key === "name");
    assert.ok(nameError);
    assert.ok(nameError.message.includes("name"));
    assert.ok(nameError.message.includes("expected"));
    assert.strictEqual(typeof nameError.key, "string");
    assert.strictEqual(typeof nameError.expected, "string");
    assert.strictEqual(typeof nameError.actual, "string");
    assert.strictEqual(typeof nameError.message, "string");
  });

  test("should handle nested path errors", () => {
    const validator = Validator();
    const schema = t.type({
      user: t.type({
        profile: t.type({
          name: t.string,
        }),
      }),
    });

    const req = createMockRequest({
      user: {
        profile: {
          name: 123,
        },
      },
    });
    const res = createMockResponse();
    const next = createMockNext();

    const [middleware] = validator.validateBody(schema, () => {});
    middleware(req as Request, res as Response, next);

    assert.strictEqual(res.statusCode, 400);
    assert.ok(Array.isArray(res.jsonData));
    const error = res.jsonData.find(
      (e: any) =>
        (typeof e.key === "string" &&
          (e.key.includes("user") ||
            e.key.includes("profile") ||
            e.key === "name")) ||
        e.key === "user.profile.name"
    );
    assert.ok(
      error,
      `Expected to find error with user/profile/name key, got: ${JSON.stringify(
        res.jsonData
      )}`
    );
  });
});

describe("validateQuery middleware", () => {
  test("should pass validation for valid query data", () => {
    const schema = t.type({
      name: t.string,
      age: t.string,
    });

    const req = createMockRequest(undefined, { name: "John", age: "30" });
    const res = createMockResponse();
    const next = createMockNext();

    validateQuery(schema)(req as Request, res as any, next);

    assert.strictEqual(next.called, true);
    assert.strictEqual(next.error, undefined);
    assert.strictEqual(res.locals.typedQuery.name, "John");
    assert.strictEqual(res.locals.typedQuery.age, "30");
    assert.strictEqual(res.statusCode, 200);
  });

  test("should reject validation for invalid query data", () => {
    const schema = t.type({
      name: t.string,
      age: t.number,
    });

    const req = createMockRequest(undefined, { name: "John", age: "not-a-number" });
    const res = createMockResponse();
    const next = createMockNext();

    validateQuery(schema)(req as Request, res as any, next);

    assert.strictEqual(next.called, false);
    assert.strictEqual(res.statusCode, 400);
    assert.ok(res.jsonData);
    assert.ok(res.jsonData.errors);
  });

  test("should use custom error handler when provided", () => {
    const schema = t.type({
      name: t.string,
    });

    const customErrorHandler = (errors: t.Errors) => {
      return { custom: "error", count: errors.length };
    };

    const req = createMockRequest(undefined, { name: 123 });
    const res = createMockResponse();
    const next = createMockNext();

    validateQuery(schema, customErrorHandler)(
      req as Request,
      res as any,
      next
    );

    assert.strictEqual(next.called, false);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.jsonData.custom, "error");
    assert.strictEqual(res.jsonData.count, 1);
  });

  test("should skip validation when schema is undefined", () => {
    const req = createMockRequest(undefined, { name: "John", age: "invalid" });
    const res = createMockResponse();
    const next = createMockNext();

    validateQuery(undefined)(req as Request, res as any, next);

    assert.strictEqual(next.called, true);
    assert.strictEqual(res.statusCode, 200);
  });
});

describe("validateParams middleware", () => {
  test("should pass validation for valid params data", () => {
    const schema = t.type({
      id: t.string,
    });

    const req = createMockRequest(undefined, undefined, { id: "123" });
    const res = createMockResponse();
    const next = createMockNext();

    validateParams(schema)(req as any, res as any, next);

    assert.strictEqual(next.called, true);
    assert.strictEqual(next.error, undefined);
    assert.strictEqual(req.params.id, "123");
    assert.strictEqual(res.statusCode, 200);
  });

  test("should reject validation for invalid params data", () => {
    const schema = t.type({
      id: t.number,
    });

    const req = createMockRequest(undefined, undefined, { id: "not-a-number" });
    const res = createMockResponse();
    const next = createMockNext();

    validateParams(schema)(req as any, res as any, next);

    assert.strictEqual(next.called, false);
    assert.strictEqual(res.statusCode, 400);
    assert.ok(res.jsonData);
    assert.ok(res.jsonData.errors);
  });

  test("should use custom error handler when provided", () => {
    const schema = t.type({
      id: t.number,
    });

    const customErrorHandler = (errors: t.Errors) => {
      return { custom: "error", count: errors.length };
    };

    const req = createMockRequest(undefined, undefined, { id: "invalid" });
    const res = createMockResponse();
    const next = createMockNext();

    validateParams(schema, customErrorHandler)(
      req as any,
      res as any,
      next
    );

    assert.strictEqual(next.called, false);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.jsonData.custom, "error");
    assert.strictEqual(res.jsonData.count, 1);
  });

  test("should skip validation when schema is undefined", () => {
    const req = createMockRequest(undefined, undefined, { id: "123" });
    const res = createMockResponse();
    const next = createMockNext();

    validateParams(undefined)(req as any, res as any, next);

    assert.strictEqual(next.called, true);
    assert.strictEqual(res.statusCode, 200);
  });
});

describe("validate combined middleware", () => {
  test("should validate query, params, and body together", async () => {
    const querySchema = t.type({ name: t.string });
    const paramsSchema = t.type({ id: t.string });
    const bodySchema = t.type({ email: t.string });

    let handlerCalled = false;
    let handlerData: any = null;

    const handler = (req: any, res: Response) => {
      handlerCalled = true;
      handlerData = {
        query: res.locals.typedQuery,
        params: res.locals.typedParams,
        body: res.locals.typedBody,
      };
      res.json({ success: true });
    };

    const pipeline = validate(
      {
        query: querySchema,
        params: paramsSchema,
        body: bodySchema,
      },
      handler
    );

    assert.strictEqual(pipeline.length, 4);

    const req = createMockRequest(
      { email: "test@example.com" },
      { name: "John" },
      { id: "123" }
    );
    const res = createMockResponse();
    const next1 = createMockNext();
    const next2 = createMockNext();
    const next3 = createMockNext();

    // Execute query middleware
    pipeline[0](req as any, res as any, next1);
    assert.strictEqual(next1.called, true);
    assert.strictEqual(res.locals.typedQuery.name, "John");

    // Execute params middleware
    pipeline[1](req as any, res as any, next2);
    assert.strictEqual(next2.called, true);
    assert.strictEqual(req.params.id, "123");
    assert.strictEqual(res.locals.typedParams.id, "123");

    // Execute body middleware
    pipeline[2](req as any, res as any, next3);
    assert.strictEqual(next3.called, true);
    assert.strictEqual(req.body.email, "test@example.com");
    assert.strictEqual(res.locals.typedBody.email, "test@example.com");

    // Execute handler
    await (pipeline[3] as (req: Request, res: Response) => Promise<void>)(
      req as any,
      res as any
    );

    assert.strictEqual(handlerCalled, true);
    assert.strictEqual(handlerData.query.name, "John");
    assert.strictEqual(handlerData.params.id, "123");
    assert.strictEqual(handlerData.body.email, "test@example.com");
  });

  test("should validate only provided schemas", async () => {
    const bodySchema = t.type({ email: t.string });

    let handlerCalled = false;

    const handler = (req: any, res: Response) => {
      handlerCalled = true;
      res.json({ success: true });
    };

    const pipeline = validate(
      {
        body: bodySchema,
        // query and params are optional
      },
      handler
    );

    const req = createMockRequest({ email: "test@example.com" });
    const res = createMockResponse();
    const next1 = createMockNext();
    const next2 = createMockNext();
    const next3 = createMockNext();

    // Query middleware should skip (no schema)
    pipeline[0](req as any, res as any, next1);
    assert.strictEqual(next1.called, true);

    // Params middleware should skip (no schema)
    pipeline[1](req as any, res as any, next2);
    assert.strictEqual(next2.called, true);

    // Body middleware should validate
    pipeline[2](req as any, res as any, next3);
    assert.strictEqual(next3.called, true);
    assert.strictEqual(req.body.email, "test@example.com");
    assert.strictEqual(res.locals.typedBody.email, "test@example.com");

    await (pipeline[3] as (req: Request, res: Response) => Promise<void>)(
      req as any,
      res as any
    );

    assert.strictEqual(handlerCalled, true);
  });

  test("should reject when any validation fails", () => {
    const querySchema = t.type({ name: t.string });
    const paramsSchema = t.type({ id: t.number });
    const bodySchema = t.type({ email: t.string });

    let handlerCalled = false;

    const handler = (req: any, res: Response) => {
      handlerCalled = true;
      res.json({ success: true });
    };

    const pipeline = validate(
      {
        query: querySchema,
        params: paramsSchema,
        body: bodySchema,
      },
      handler
    );

    const req = createMockRequest(
      { email: "test@example.com" },
      { name: "John" },
      { id: "not-a-number" }
    );
    const res = createMockResponse();
    const next1 = createMockNext();
    const next2 = createMockNext();

    // Query middleware passes
    pipeline[0](req as any, res as any, next1);
    assert.strictEqual(next1.called, true);

    // Params middleware fails
    pipeline[1](req as any, res as any, next2);
    assert.strictEqual(next2.called, false);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(handlerCalled, false);
  });

  test("should use custom error handler from Validator", () => {
    const customErrorHandler = (errors: t.Errors) => {
      return { message: "Validation failed", errors: errors.length };
    };

    const validator = Validator(customErrorHandler);
    const querySchema = t.type({ name: t.number });

    const req = createMockRequest(undefined, { name: "John" });
    const res = createMockResponse();
    const next = createMockNext();

    const pipeline = validator.validate(
      { query: querySchema },
      () => {}
    );

    pipeline[0](req as any, res as any, next);

    assert.strictEqual(next.called, false);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.jsonData.message, "Validation failed");
    assert.strictEqual(res.jsonData.errors, 1);
  });
});
