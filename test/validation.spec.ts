import { test, describe } from "node:test";
import assert from "node:assert";
import { Request, Response, NextFunction } from "express";
import * as t from "io-ts";
import { validate, validatedRoute, Validator } from "../src/index.js";

// Mock Express types
type MockRequest = Partial<Request> & {
  body: any;
};

type MockResponse = Partial<Response> & {
  statusCode: number;
  jsonData: any;
  status: (code: number) => MockResponse;
  json: (data: any) => MockResponse;
};

type MockNextFunction = NextFunction & {
  called: boolean;
  error: any;
};

function createMockRequest(body: any): MockRequest {
  return {
    body,
  };
}

function createMockResponse(): MockResponse {
  const res: MockResponse = {
    statusCode: 200,
    jsonData: null,
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

    validate(schema)(req as Request, res as Response, next);

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

    validate(schema)(req as Request, res as Response, next);

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

    validate(schema, customErrorHandler)(req as Request, res as Response, next);

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

    validate(schema)(req as Request, res as Response, next);

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

    validate(schema)(req as Request, res as Response, next);

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

    validate(schema)(req as Request, res as Response, next);

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

    validate(schema)(req as Request, res as Response, next);

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

    validate(schema)(req as Request, res as Response, next);

    assert.strictEqual(next.called, false);
    assert.strictEqual(res.statusCode, 400);
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

    const [middleware] = validator.validate(schema, () => {});

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

    const [middleware] = validator.validate(schema, () => {});

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

    const [middleware, handler] = validator.validate(schema, (req, res) => {
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

    const [middleware] = validator.validate(schema, () => {});
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

    const [middleware] = validator.validate(schema, () => {});
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
