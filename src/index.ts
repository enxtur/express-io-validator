import { NextFunction, Request, Response } from "express";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";

// ============================================================================
// Types
// ============================================================================

type ErrorHandler = (error: t.Errors) => unknown;

type DefaultErrors = {
  key: string;
  expected: string;
  actual: string;
  message: string;
};

// Request/Response types
type TypedBodyRequest<T extends t.Any> = Request<any, any, t.TypeOf<T>, any>;
type TypedQueryResponse<T extends t.Any> = Response<
  any,
  {
    typedQuery: t.TypeOf<T>;
  }
>;
type TypedParamsRequest<T extends t.Any> = Request<t.TypeOf<T>, any, any, any>;

type TypedCombinedRequest<
  Q extends t.Any,
  P extends t.Any,
  B extends t.Any
> = Request<
  P extends t.Any ? t.TypeOf<P> : any,
  any,
  B extends t.Any ? t.TypeOf<B> : any,
  Q extends t.Any ? t.TypeOf<Q> : any
>;

type TypedCombinedResponse<
  Q extends t.Any,
  P extends t.Any,
  B extends t.Any
> = Response<
  any,
  {
    typedQuery: Q extends t.Any ? t.TypeOf<Q> : never;
    typedParams: P extends t.Any ? t.TypeOf<P> : never;
    typedBody: B extends t.Any ? t.TypeOf<B> : never;
  }
>;

// Middleware types
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

type TypedCombinedValidationMiddleware<
  Q extends t.Any,
  P extends t.Any,
  B extends t.Any
> = (
  req: TypedCombinedRequest<Q, P, B>,
  res: TypedCombinedResponse<Q, P, B>,
  next: NextFunction
) => void;

// Handler types
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

type TypedValidatedHandler<
  Q extends t.Any,
  P extends t.Any,
  B extends t.Any
> = (
  req: TypedCombinedRequest<Q, P, B>,
  res: TypedCombinedResponse<Q, P, B>
) => void | Promise<void>;

// Pipeline types
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

type TypedValidationPipeline<
  Q extends t.Any,
  P extends t.Any,
  B extends t.Any
> = [
  TypedCombinedValidationMiddleware<Q, P, B>,
  TypedCombinedValidationMiddleware<Q, P, B>,
  TypedCombinedValidationMiddleware<Q, P, B>,
  TypedValidatedHandler<Q, P, B>
];

// ============================================================================
// Error handling
// ============================================================================

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

// ============================================================================
// Validation middleware factory
// ============================================================================

type ValidationSource = "body" | "query" | "params";

const createValidationMiddleware = <T extends t.Any>(
  schema: T | undefined,
  source: ValidationSource,
  errorHandler?: ErrorHandler
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!schema) {
      next();
      return;
    }

    const data =
      source === "body"
        ? req.body
        : source === "query"
          ? req.query
          : req.params;

    const result = schema.decode(data);

    if (isLeft(result)) {
      const payload = errorHandler?.(result.left) ?? {
        errors: formatValidationErrors(result.left),
      };
      res.status(400).json(payload);
      return;
    }

    const validatedValue = result.right;

    // Set validated value based on source
    if (source === "body") {
      req.body = validatedValue;
    } else if (source === "query") {
      res.locals.typedQuery = validatedValue;
    } else {
      req.params = validatedValue;
    }

    next();
  };
};

// ============================================================================
// Public validation middleware
// ============================================================================

export const validateBody = <T extends t.Any>(
  schema?: T,
  errorHandler?: ErrorHandler
): TypedBodyValidationMiddleware<T> => {
  return createValidationMiddleware(schema, "body", errorHandler) as TypedBodyValidationMiddleware<T>;
};

export const validateQuery = <T extends t.Any>(
  schema?: T,
  errorHandler?: ErrorHandler
): TypedQueryValidationMiddleware<T> => {
  return createValidationMiddleware(schema, "query", errorHandler) as TypedQueryValidationMiddleware<T>;
};

export const validateParams = <T extends t.Any>(
  schema?: T,
  errorHandler?: ErrorHandler
): TypedParamsValidationMiddleware<T> => {
  return createValidationMiddleware(schema, "params", errorHandler) as TypedParamsValidationMiddleware<T>;
};

// ============================================================================
// Combined validation middleware
// ============================================================================

const createCombinedQueryMiddleware = <Q extends t.Any>(
  schema: Q | undefined,
  errorHandler?: ErrorHandler
): TypedCombinedValidationMiddleware<Q, any, any> => {
  return createValidationMiddleware(schema, "query", errorHandler) as TypedCombinedValidationMiddleware<Q, any, any>;
};

const createCombinedParamsMiddleware = <P extends t.Any>(
  schema: P | undefined,
  errorHandler?: ErrorHandler
): TypedCombinedValidationMiddleware<any, P, any> => {
  const middleware = createValidationMiddleware(schema, "params", errorHandler);
  return ((req, res, next) => {
    middleware(req, res, () => {
      res.locals.typedParams = req.params;
      next();
    });
  }) as TypedCombinedValidationMiddleware<any, P, any>;
};

const createCombinedBodyMiddleware = <B extends t.Any>(
  schema: B | undefined,
  errorHandler?: ErrorHandler
): TypedCombinedValidationMiddleware<any, any, B> => {
  const middleware = createValidationMiddleware(schema, "body", errorHandler);
  return ((req, res, next) => {
    middleware(req, res, () => {
      res.locals.typedBody = req.body;
      next();
    });
  }) as TypedCombinedValidationMiddleware<any, any, B>;
};

export const validate = <Q extends t.Any, P extends t.Any, B extends t.Any>(
  schemas: { query?: Q; params?: P; body?: B },
  handler: TypedValidatedHandler<Q, P, B>
): TypedValidationPipeline<Q, P, B> => {
  return [
    createCombinedQueryMiddleware(schemas.query) as TypedCombinedValidationMiddleware<Q, P, B>,
    createCombinedParamsMiddleware(schemas.params) as TypedCombinedValidationMiddleware<Q, P, B>,
    createCombinedBodyMiddleware(schemas.body) as TypedCombinedValidationMiddleware<Q, P, B>,
    handler,
  ];
};

// ============================================================================
// Route helpers
// ============================================================================

export const validatedRoute = <T extends t.Any>(
  schema: T,
  handler: TypedBodyValidatedHandler<T>
): TypedBodyValidationPipeline<T> => {
  return [validateBody(schema), handler];
};

// ============================================================================
// Validator factory
// ============================================================================

const createValidationPipeline = (
  validateFn: <T extends t.Any>(schema: T, errorHandler?: ErrorHandler) => any,
  errorHandler: ErrorHandler
) => {
  return <S extends t.Any>(
    schema: S,
    handler: any
  ): [any, any] => {
    return [validateFn(schema, errorHandler), handler];
  };
};

export const Validator = (errorHandler?: ErrorHandler) => {
  const errHandler = errorHandler ?? defaultErrorHandler;
  return {
    validateBody: createValidationPipeline(validateBody, errHandler) as <T extends t.Any>(
      schema: T,
      handler: TypedBodyValidatedHandler<T>
    ) => TypedBodyValidationPipeline<T>,
    validateQuery: createValidationPipeline(validateQuery, errHandler) as <T extends t.Any>(
      schema: T,
      handler: TypedQueryValidatedHandler<T>
    ) => TypedQueryValidationPipeline<T>,
    validateParams: createValidationPipeline(validateParams, errHandler) as <T extends t.Any>(
      schema: T,
      handler: TypedParamsValidatedHandler<T>
    ) => TypedParamsValidationPipeline<T>,
    validate: <Q extends t.Any, P extends t.Any, B extends t.Any>(
      schemas: { query?: Q; params?: P; body?: B },
      handler: TypedValidatedHandler<Q, P, B>
    ): TypedValidationPipeline<Q, P, B> => {
      return [
        createCombinedQueryMiddleware(schemas.query, errHandler) as TypedCombinedValidationMiddleware<Q, P, B>,
        createCombinedParamsMiddleware(schemas.params, errHandler) as TypedCombinedValidationMiddleware<Q, P, B>,
        createCombinedBodyMiddleware(schemas.body, errHandler) as TypedCombinedValidationMiddleware<Q, P, B>,
        handler,
      ];
    },
  };
};
