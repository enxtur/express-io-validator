import { NextFunction, Request, Response } from "express";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";

type ErrorHandler = (error: t.Errors) => unknown;

type DefaultErrors = {
  key: string;
  expected: string;
  actual: string;
  message: string;
};

type TypedRequest<T extends t.Any> = Request<any, any, t.TypeOf<T>, any>;

type ValidationMiddleware<T extends t.Any> = (
  req: TypedRequest<T>,
  res: Response,
  next: NextFunction
) => void;

type ValidatedHandler<T extends t.Any> = (
  req: TypedRequest<T>,
  res: Response
) => void | Promise<void>;

type ValidationPipeline<T extends t.Any> = [
  ValidationMiddleware<T>,
  ValidatedHandler<T>
];

const formatValidationErrors = (error: t.Errors): DefaultErrors[] => {
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

const defaultErrorHandler: ErrorHandler = (error) => {
  return formatValidationErrors(error);
};

export const validateBody = <T extends t.Any>(
  schema: T,
  errorHandler?: ErrorHandler
): ValidationMiddleware<T> => {
  return (req, res, next): void => {
    const result = schema.decode(req.body);

    if (isLeft(result)) {
      const payload = errorHandler?.(result.left) ?? {
        errors: formatValidationErrors(result.left),
      };
      res.status(400).json(payload);
      return;
    }

    req.body = result.right;
    next();
  };
};

export const validatedRoute = <T extends t.Any>(
  schema: T,
  handler: ValidatedHandler<T>
): ValidationPipeline<T> => {
  return [validateBody(schema), handler];
};

const validateBodyWithErrorHandler = (errorHandler: ErrorHandler) => {
  return <T extends t.Any>(
    schema: T,
    handler: ValidatedHandler<T>
  ): ValidationPipeline<T> => {
    return [validateBody(schema, errorHandler), handler];
  };
};

export const Validator = (errorHandler?: ErrorHandler) => {
  return {
    validateBody: validateBodyWithErrorHandler(
      errorHandler ?? defaultErrorHandler
    ),
  };
};
