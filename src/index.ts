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

type TypedBodyRequest<T extends t.Any> = Request<any, any, t.TypeOf<T>, any>;
type TypedQueryResponse<T extends t.Any> = Response<
  any,
  {
    typedQuery: t.TypeOf<T>;
  }
>;
type TypedParamsRequest<T extends t.Any> = Request<t.TypeOf<T>, any, any, any>;

type TypedBodyValidationMiddleware<T extends t.Any> = (
  req: TypedBodyRequest<T>,
  res: Response,
  next: NextFunction
) => void;

type TypedQueryValidationMiddleware<T extends t.Any> = (
  req: Request,
  res: TypedQueryResponse<T>,
  next: NextFunction
) => void;

type TypedParamsValidationMiddleware<T extends t.Any> = (
  req: TypedParamsRequest<T>,
  res: Response,
  next: NextFunction
) => void;

type TypedBodyValidatedHandler<T extends t.Any> = (
  req: TypedBodyRequest<T>,
  res: Response
) => void | Promise<void>;

type TypedQueryValidatedHandler<T extends t.Any> = (
  req: Request,
  res: TypedQueryResponse<T>
) => void | Promise<void>;

type TypedParamsValidatedHandler<T extends t.Any> = (
  req: TypedParamsRequest<T>,
  res: Response
) => void | Promise<void>;

type TypedBodyValidationPipeline<T extends t.Any> = [
  TypedBodyValidationMiddleware<T>,
  TypedBodyValidatedHandler<T>
];

type TypedQueryValidationPipeline<T extends t.Any> = [
  TypedQueryValidationMiddleware<T>,
  TypedQueryValidatedHandler<T>
];

type TypedParamsValidationPipeline<T extends t.Any> = [
  TypedParamsValidationMiddleware<T>,
  TypedParamsValidatedHandler<T>
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
): TypedBodyValidationMiddleware<T> => {
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

export const validateQuery = <T extends t.Any>(
  schema: T,
  errorHandler?: ErrorHandler
): TypedQueryValidationMiddleware<T> => {
  return (req, res, next): void => {
    const result = schema.decode(req.query);

    if (isLeft(result)) {
      const payload = errorHandler?.(result.left) ?? {
        errors: formatValidationErrors(result.left),
      };
      res.status(400).json(payload);
      return;
    }

    res.locals.typedQuery = result.right;
    next();
  };
};

export const validateParams = <T extends t.Any>(
  schema: T,
  errorHandler?: ErrorHandler
): TypedParamsValidationMiddleware<T> => {
  return (req, res, next): void => {
    const result = schema.decode(req.params);

    if (isLeft(result)) {
      const payload = errorHandler?.(result.left) ?? {
        errors: formatValidationErrors(result.left),
      };
      res.status(400).json(payload);
      return;
    }

    req.params = result.right;
    next();
  };
};

export const validatedRoute = <T extends t.Any>(
  schema: T,
  handler: TypedBodyValidatedHandler<T>
): TypedBodyValidationPipeline<T> => {
  return [validateBody(schema), handler];
};

const validateBodyWithErrorHandler = (errorHandler: ErrorHandler) => {
  return <T extends t.Any>(
    schema: T,
    handler: TypedBodyValidatedHandler<T>
  ): TypedBodyValidationPipeline<T> => {
    return [validateBody(schema, errorHandler), handler];
  };
};

const validateQueryWithErrorHandler = (errorHandler: ErrorHandler) => {
  return <T extends t.Any>(
    schema: T,
    handler: TypedQueryValidatedHandler<T>
  ): TypedQueryValidationPipeline<T> => {
    return [validateQuery(schema, errorHandler), handler];
  };
};

const validateParamsWithErrorHandler = (errorHandler: ErrorHandler) => {
  return <T extends t.Any>(
    schema: T,
    handler: TypedParamsValidatedHandler<T>
  ): TypedParamsValidationPipeline<T> => {
    return [validateParams(schema, errorHandler), handler];
  };
};

export const Validator = (errorHandler?: ErrorHandler) => {
  return {
    validateBody: validateBodyWithErrorHandler(
      errorHandler ?? defaultErrorHandler
    ),
    validateQuery: validateQueryWithErrorHandler(
      errorHandler ?? defaultErrorHandler
    ),
    validateParams: validateParamsWithErrorHandler(
      errorHandler ?? defaultErrorHandler
    ),
  };
};
