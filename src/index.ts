import { NextFunction, Request, Response } from "express";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";

export const validate = <T>(schema: t.Type<T>, errorHandler?: ErrorHandler) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.decode(req.body);
    if (isLeft(result)) {
      if (errorHandler) {
        const error = errorHandler(result.left);
        res.status(400).json(error);
      } else {
        res.status(400).json({ errors: result.left });
      }
      return;
    }
    req.body = result.right;
    next();
  };
};

interface TypedRequest<T extends t.Any> extends Request {
  body: t.TypeOf<T>;
}

export const validatedRoute = <T extends t.Any>(
  schema: T,
  handler: (
    req: TypedRequest<typeof schema>,
    res: Response
  ) => void | Promise<void>
) => {
  return [validate(schema), handler];
};

const validatedRouteWithErrorHandler = (errorHandler: ErrorHandler) => {
  return <T extends t.Any>(
    schema: T,
    handler: (
      req: TypedRequest<typeof schema>,
      res: Response
    ) => void | Promise<void>
  ) => {
    return [validate(schema, errorHandler), handler];
  };
};

type ErrorHandler = (error: t.Errors) => any;

type DefaultErrors = {
  key: string;
  expected: string;
  actual: string;
  message: string;
};

const defaultErrorHandler: ErrorHandler = (error): DefaultErrors[] => {
  return error.map((err) => {
    const path = err.context
      .slice(1)
      .map((c) => c.key)
      .filter((key) => key !== "")
      .join(".");

    const lastContext = err.context[err.context.length - 1];
    const key = path || lastContext?.key || "unknown";
    const expected = lastContext?.type?.name || "unknown";
    const actual =
      typeof err.value === "object" && err.value !== null
        ? JSON.stringify(err.value)
        : String(err.value);
    const message = `Invalid value for '${key}': expected ${expected}, got ${actual}`;

    return {
      key,
      expected,
      actual,
      message,
    };
  });
};

export const Validator = (errorHandler?: ErrorHandler) => {
  return {
    validate: validatedRouteWithErrorHandler(
      errorHandler ?? defaultErrorHandler
    ),
  };
};
