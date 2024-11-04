/* eslint-disable */

import { AllTypesProps, ReturnTypes, Ops } from './const';
export const HOST = "http://localhost:8419/v1/graphql"


export const HEADERS = {}
export const apiSubscription = (options: chainOptions) => (query: string) => {
  try {
    const queryString = options[0] + '?query=' + encodeURIComponent(query);
    const wsString = queryString.replace('http', 'ws');
    const host = (options.length > 1 && options[1]?.websocket?.[0]) || wsString;
    const webSocketOptions = options[1]?.websocket || [host];
    const ws = new WebSocket(...webSocketOptions);
    return {
      ws,
      on: (e: (args: any) => void) => {
        ws.onmessage = (event: any) => {
          if (event.data) {
            const parsed = JSON.parse(event.data);
            const data = parsed.data;
            return e(data);
          }
        };
      },
      off: (e: (args: any) => void) => {
        ws.onclose = e;
      },
      error: (e: (args: any) => void) => {
        ws.onerror = e;
      },
      open: (e: () => void) => {
        ws.onopen = e;
      },
    };
  } catch {
    throw new Error('No websockets implemented');
  }
};
const handleFetchResponse = (response: Response): Promise<GraphQLResponse> => {
  if (!response.ok) {
    return new Promise((_, reject) => {
      response
        .text()
        .then((text) => {
          try {
            reject(JSON.parse(text));
          } catch (err) {
            reject(text);
          }
        })
        .catch(reject);
    });
  }
  return response.json() as Promise<GraphQLResponse>;
};

export const apiFetch =
  (options: fetchOptions) =>
  (query: string, variables: Record<string, unknown> = {}) => {
    const fetchOptions = options[1] || {};
    if (fetchOptions.method && fetchOptions.method === 'GET') {
      return fetch(`${options[0]}?query=${encodeURIComponent(query)}`, fetchOptions)
        .then(handleFetchResponse)
        .then((response: GraphQLResponse) => {
          if (response.errors) {
            throw new GraphQLError(response);
          }
          return response.data;
        });
    }
    return fetch(`${options[0]}`, {
      body: JSON.stringify({ query, variables }),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      ...fetchOptions,
    })
      .then(handleFetchResponse)
      .then((response: GraphQLResponse) => {
        if (response.errors) {
          throw new GraphQLError(response);
        }
        return response.data;
      });
  };

export const InternalsBuildQuery = ({
  ops,
  props,
  returns,
  options,
  scalars,
}: {
  props: AllTypesPropsType;
  returns: ReturnTypesType;
  ops: Operations;
  options?: OperationOptions;
  scalars?: ScalarDefinition;
}) => {
  const ibb = (
    k: string,
    o: InputValueType | VType,
    p = '',
    root = true,
    vars: Array<{ name: string; graphQLType: string }> = [],
  ): string => {
    const keyForPath = purifyGraphQLKey(k);
    const newPath = [p, keyForPath].join(SEPARATOR);
    if (!o) {
      return '';
    }
    if (typeof o === 'boolean' || typeof o === 'number') {
      return k;
    }
    if (typeof o === 'string') {
      return `${k} ${o}`;
    }
    if (Array.isArray(o)) {
      const args = InternalArgsBuilt({
        props,
        returns,
        ops,
        scalars,
        vars,
      })(o[0], newPath);
      return `${ibb(args ? `${k}(${args})` : k, o[1], p, false, vars)}`;
    }
    if (k === '__alias') {
      return Object.entries(o)
        .map(([alias, objectUnderAlias]) => {
          if (typeof objectUnderAlias !== 'object' || Array.isArray(objectUnderAlias)) {
            throw new Error(
              'Invalid alias it should be __alias:{ YOUR_ALIAS_NAME: { OPERATION_NAME: { ...selectors }}}',
            );
          }
          const operationName = Object.keys(objectUnderAlias)[0];
          const operation = objectUnderAlias[operationName];
          return ibb(`${alias}:${operationName}`, operation, p, false, vars);
        })
        .join('\n');
    }
    const hasOperationName = root && options?.operationName ? ' ' + options.operationName : '';
    const keyForDirectives = o.__directives ?? '';
    const query = `{${Object.entries(o)
      .filter(([k]) => k !== '__directives')
      .map((e) => ibb(...e, [p, `field<>${keyForPath}`].join(SEPARATOR), false, vars))
      .join('\n')}}`;
    if (!root) {
      return `${k} ${keyForDirectives}${hasOperationName} ${query}`;
    }
    const varsString = vars.map((v) => `${v.name}: ${v.graphQLType}`).join(', ');
    return `${k} ${keyForDirectives}${hasOperationName}${varsString ? `(${varsString})` : ''} ${query}`;
  };
  return ibb;
};

type UnionOverrideKeys<T, U> = Omit<T, keyof U> & U;

export const Thunder =
  <SCLR extends ScalarDefinition>(fn: FetchFunction, thunderGraphQLOptions?: ThunderGraphQLOptions<SCLR>) =>
  <O extends keyof typeof Ops, OVERRIDESCLR extends SCLR, R extends keyof ValueTypes = GenericOperation<O>>(
    operation: O,
    graphqlOptions?: ThunderGraphQLOptions<OVERRIDESCLR>,
  ) =>
  <Z extends ValueTypes[R]>(
    o: Z & {
      [P in keyof Z]: P extends keyof ValueTypes[R] ? Z[P] : never;
    },
    ops?: OperationOptions & { variables?: Record<string, unknown> },
  ) => {
    const options = {
      ...thunderGraphQLOptions,
      ...graphqlOptions,
    };
    return fn(
      Zeus(operation, o, {
        operationOptions: ops,
        scalars: options?.scalars,
      }),
      ops?.variables,
    ).then((data) => {
      if (options?.scalars) {
        return decodeScalarsInResponse({
          response: data,
          initialOp: operation,
          initialZeusQuery: o as VType,
          returns: ReturnTypes,
          scalars: options.scalars,
          ops: Ops,
        });
      }
      return data;
    }) as Promise<InputType<GraphQLTypes[R], Z, UnionOverrideKeys<SCLR, OVERRIDESCLR>>>;
  };

export const Chain = (...options: chainOptions) => Thunder(apiFetch(options));

export const SubscriptionThunder =
  <SCLR extends ScalarDefinition>(fn: SubscriptionFunction, thunderGraphQLOptions?: ThunderGraphQLOptions<SCLR>) =>
  <O extends keyof typeof Ops, OVERRIDESCLR extends SCLR, R extends keyof ValueTypes = GenericOperation<O>>(
    operation: O,
    graphqlOptions?: ThunderGraphQLOptions<OVERRIDESCLR>,
  ) =>
  <Z extends ValueTypes[R]>(
    o: Z & {
      [P in keyof Z]: P extends keyof ValueTypes[R] ? Z[P] : never;
    },
    ops?: OperationOptions & { variables?: ExtractVariables<Z> },
  ) => {
    const options = {
      ...thunderGraphQLOptions,
      ...graphqlOptions,
    };
    type CombinedSCLR = UnionOverrideKeys<SCLR, OVERRIDESCLR>;
    const returnedFunction = fn(
      Zeus(operation, o, {
        operationOptions: ops,
        scalars: options?.scalars,
      }),
    ) as SubscriptionToGraphQL<Z, GraphQLTypes[R], CombinedSCLR>;
    if (returnedFunction?.on && options?.scalars) {
      const wrapped = returnedFunction.on;
      returnedFunction.on = (fnToCall: (args: InputType<GraphQLTypes[R], Z, CombinedSCLR>) => void) =>
        wrapped((data: InputType<GraphQLTypes[R], Z, CombinedSCLR>) => {
          if (options?.scalars) {
            return fnToCall(
              decodeScalarsInResponse({
                response: data,
                initialOp: operation,
                initialZeusQuery: o as VType,
                returns: ReturnTypes,
                scalars: options.scalars,
                ops: Ops,
              }),
            );
          }
          return fnToCall(data);
        });
    }
    return returnedFunction;
  };

export const Subscription = (...options: chainOptions) => SubscriptionThunder(apiSubscription(options));
export const Zeus = <
  Z extends ValueTypes[R],
  O extends keyof typeof Ops,
  R extends keyof ValueTypes = GenericOperation<O>,
>(
  operation: O,
  o: Z,
  ops?: {
    operationOptions?: OperationOptions;
    scalars?: ScalarDefinition;
  },
) =>
  InternalsBuildQuery({
    props: AllTypesProps,
    returns: ReturnTypes,
    ops: Ops,
    options: ops?.operationOptions,
    scalars: ops?.scalars,
  })(operation, o as VType);

export const ZeusSelect = <T>() => ((t: unknown) => t) as SelectionFunction<T>;

export const Selector = <T extends keyof ValueTypes>(key: T) => key && ZeusSelect<ValueTypes[T]>();

export const TypeFromSelector = <T extends keyof ValueTypes>(key: T) => key && ZeusSelect<ValueTypes[T]>();
export const Gql = Chain(HOST, {
  headers: {
    'Content-Type': 'application/json',
    ...HEADERS,
  },
});

export const ZeusScalars = ZeusSelect<ScalarCoders>();

type ScalarsSelector<T> = {
  [X in Required<{
    [P in keyof T]: T[P] extends number | string | undefined | boolean ? P : never;
  }>[keyof T]]: true;
};

export const fields = <T extends keyof ModelTypes>(k: T) => {
  const t = ReturnTypes[k];
  const o = Object.fromEntries(
    Object.entries(t)
      .filter(([, value]) => {
        const isReturnType = ReturnTypes[value as string];
        if (!isReturnType || (typeof isReturnType === 'string' && isReturnType.startsWith('scalar.'))) {
          return true;
        }
      })
      .map(([key]) => [key, true as const]),
  );
  return o as ScalarsSelector<ModelTypes[T]>;
};

export const decodeScalarsInResponse = <O extends Operations>({
  response,
  scalars,
  returns,
  ops,
  initialZeusQuery,
  initialOp,
}: {
  ops: O;
  response: any;
  returns: ReturnTypesType;
  scalars?: Record<string, ScalarResolver | undefined>;
  initialOp: keyof O;
  initialZeusQuery: InputValueType | VType;
}) => {
  if (!scalars) {
    return response;
  }
  const builder = PrepareScalarPaths({
    ops,
    returns,
  });

  const scalarPaths = builder(initialOp as string, ops[initialOp], initialZeusQuery);
  if (scalarPaths) {
    const r = traverseResponse({ scalarPaths, resolvers: scalars })(initialOp as string, response, [ops[initialOp]]);
    return r;
  }
  return response;
};

export const traverseResponse = ({
  resolvers,
  scalarPaths,
}: {
  scalarPaths: { [x: string]: `scalar.${string}` };
  resolvers: {
    [x: string]: ScalarResolver | undefined;
  };
}) => {
  const ibb = (k: string, o: InputValueType | VType, p: string[] = []): unknown => {
    if (Array.isArray(o)) {
      return o.map((eachO) => ibb(k, eachO, p));
    }
    if (o == null) {
      return o;
    }
    const scalarPathString = p.join(SEPARATOR);
    const currentScalarString = scalarPaths[scalarPathString];
    if (currentScalarString) {
      const currentDecoder = resolvers[currentScalarString.split('.')[1]]?.decode;
      if (currentDecoder) {
        return currentDecoder(o);
      }
    }
    if (typeof o === 'boolean' || typeof o === 'number' || typeof o === 'string' || !o) {
      return o;
    }
    const entries = Object.entries(o).map(([k, v]) => [k, ibb(k, v, [...p, purifyGraphQLKey(k)])] as const);
    const objectFromEntries = entries.reduce<Record<string, unknown>>((a, [k, v]) => {
      a[k] = v;
      return a;
    }, {});
    return objectFromEntries;
  };
  return ibb;
};

export type AllTypesPropsType = {
  [x: string]:
    | undefined
    | `scalar.${string}`
    | 'enum'
    | {
        [x: string]:
          | undefined
          | string
          | {
              [x: string]: string | undefined;
            };
      };
};

export type ReturnTypesType = {
  [x: string]:
    | {
        [x: string]: string | undefined;
      }
    | `scalar.${string}`
    | undefined;
};
export type InputValueType = {
  [x: string]: undefined | boolean | string | number | [any, undefined | boolean | InputValueType] | InputValueType;
};
export type VType =
  | undefined
  | boolean
  | string
  | number
  | [any, undefined | boolean | InputValueType]
  | InputValueType;

export type PlainType = boolean | number | string | null | undefined;
export type ZeusArgsType =
  | PlainType
  | {
      [x: string]: ZeusArgsType;
    }
  | Array<ZeusArgsType>;

export type Operations = Record<string, string>;

export type VariableDefinition = {
  [x: string]: unknown;
};

export const SEPARATOR = '|';

export type fetchOptions = Parameters<typeof fetch>;
type websocketOptions = typeof WebSocket extends new (...args: infer R) => WebSocket ? R : never;
export type chainOptions = [fetchOptions[0], fetchOptions[1] & { websocket?: websocketOptions }] | [fetchOptions[0]];
export type FetchFunction = (query: string, variables?: Record<string, unknown>) => Promise<any>;
export type SubscriptionFunction = (query: string) => any;
type NotUndefined<T> = T extends undefined ? never : T;
export type ResolverType<F> = NotUndefined<F extends [infer ARGS, any] ? ARGS : undefined>;

export type OperationOptions = {
  operationName?: string;
};

export type ScalarCoder = Record<string, (s: unknown) => string>;

export interface GraphQLResponse {
  data?: Record<string, any>;
  errors?: Array<{
    message: string;
  }>;
}
export class GraphQLError extends Error {
  constructor(public response: GraphQLResponse) {
    super('');
    console.error(response);
  }
  toString() {
    return 'GraphQL Response Error';
  }
}
export type GenericOperation<O> = O extends keyof typeof Ops ? typeof Ops[O] : never;
export type ThunderGraphQLOptions<SCLR extends ScalarDefinition> = {
  scalars?: SCLR | ScalarCoders;
};

const ExtractScalar = (mappedParts: string[], returns: ReturnTypesType): `scalar.${string}` | undefined => {
  if (mappedParts.length === 0) {
    return;
  }
  const oKey = mappedParts[0];
  const returnP1 = returns[oKey];
  if (typeof returnP1 === 'object') {
    const returnP2 = returnP1[mappedParts[1]];
    if (returnP2) {
      return ExtractScalar([returnP2, ...mappedParts.slice(2)], returns);
    }
    return undefined;
  }
  return returnP1 as `scalar.${string}` | undefined;
};

export const PrepareScalarPaths = ({ ops, returns }: { returns: ReturnTypesType; ops: Operations }) => {
  const ibb = (
    k: string,
    originalKey: string,
    o: InputValueType | VType,
    p: string[] = [],
    pOriginals: string[] = [],
    root = true,
  ): { [x: string]: `scalar.${string}` } | undefined => {
    if (!o) {
      return;
    }
    if (typeof o === 'boolean' || typeof o === 'number' || typeof o === 'string') {
      const extractionArray = [...pOriginals, originalKey];
      const isScalar = ExtractScalar(extractionArray, returns);
      if (isScalar?.startsWith('scalar')) {
        const partOfTree = {
          [[...p, k].join(SEPARATOR)]: isScalar,
        };
        return partOfTree;
      }
      return {};
    }
    if (Array.isArray(o)) {
      return ibb(k, k, o[1], p, pOriginals, false);
    }
    if (k === '__alias') {
      return Object.entries(o)
        .map(([alias, objectUnderAlias]) => {
          if (typeof objectUnderAlias !== 'object' || Array.isArray(objectUnderAlias)) {
            throw new Error(
              'Invalid alias it should be __alias:{ YOUR_ALIAS_NAME: { OPERATION_NAME: { ...selectors }}}',
            );
          }
          const operationName = Object.keys(objectUnderAlias)[0];
          const operation = objectUnderAlias[operationName];
          return ibb(alias, operationName, operation, p, pOriginals, false);
        })
        .reduce((a, b) => ({
          ...a,
          ...b,
        }));
    }
    const keyName = root ? ops[k] : k;
    return Object.entries(o)
      .filter(([k]) => k !== '__directives')
      .map(([k, v]) => {
        // Inline fragments shouldn't be added to the path as they aren't a field
        const isInlineFragment = originalKey.match(/^...\s*on/) != null;
        return ibb(
          k,
          k,
          v,
          isInlineFragment ? p : [...p, purifyGraphQLKey(keyName || k)],
          isInlineFragment ? pOriginals : [...pOriginals, purifyGraphQLKey(originalKey)],
          false,
        );
      })
      .reduce((a, b) => ({
        ...a,
        ...b,
      }));
  };
  return ibb;
};

export const purifyGraphQLKey = (k: string) => k.replace(/\([^)]*\)/g, '').replace(/^[^:]*\:/g, '');

const mapPart = (p: string) => {
  const [isArg, isField] = p.split('<>');
  if (isField) {
    return {
      v: isField,
      __type: 'field',
    } as const;
  }
  return {
    v: isArg,
    __type: 'arg',
  } as const;
};

type Part = ReturnType<typeof mapPart>;

export const ResolveFromPath = (props: AllTypesPropsType, returns: ReturnTypesType, ops: Operations) => {
  const ResolvePropsType = (mappedParts: Part[]) => {
    const oKey = ops[mappedParts[0].v];
    const propsP1 = oKey ? props[oKey] : props[mappedParts[0].v];
    if (propsP1 === 'enum' && mappedParts.length === 1) {
      return 'enum';
    }
    if (typeof propsP1 === 'string' && propsP1.startsWith('scalar.') && mappedParts.length === 1) {
      return propsP1;
    }
    if (typeof propsP1 === 'object') {
      if (mappedParts.length < 2) {
        return 'not';
      }
      const propsP2 = propsP1[mappedParts[1].v];
      if (typeof propsP2 === 'string') {
        return rpp(
          `${propsP2}${SEPARATOR}${mappedParts
            .slice(2)
            .map((mp) => mp.v)
            .join(SEPARATOR)}`,
        );
      }
      if (typeof propsP2 === 'object') {
        if (mappedParts.length < 3) {
          return 'not';
        }
        const propsP3 = propsP2[mappedParts[2].v];
        if (propsP3 && mappedParts[2].__type === 'arg') {
          return rpp(
            `${propsP3}${SEPARATOR}${mappedParts
              .slice(3)
              .map((mp) => mp.v)
              .join(SEPARATOR)}`,
          );
        }
      }
    }
  };
  const ResolveReturnType = (mappedParts: Part[]) => {
    if (mappedParts.length === 0) {
      return 'not';
    }
    const oKey = ops[mappedParts[0].v];
    const returnP1 = oKey ? returns[oKey] : returns[mappedParts[0].v];
    if (typeof returnP1 === 'object') {
      if (mappedParts.length < 2) return 'not';
      const returnP2 = returnP1[mappedParts[1].v];
      if (returnP2) {
        return rpp(
          `${returnP2}${SEPARATOR}${mappedParts
            .slice(2)
            .map((mp) => mp.v)
            .join(SEPARATOR)}`,
        );
      }
    }
  };
  const rpp = (path: string): 'enum' | 'not' | `scalar.${string}` => {
    const parts = path.split(SEPARATOR).filter((l) => l.length > 0);
    const mappedParts = parts.map(mapPart);
    const propsP1 = ResolvePropsType(mappedParts);
    if (propsP1) {
      return propsP1;
    }
    const returnP1 = ResolveReturnType(mappedParts);
    if (returnP1) {
      return returnP1;
    }
    return 'not';
  };
  return rpp;
};

export const InternalArgsBuilt = ({
  props,
  ops,
  returns,
  scalars,
  vars,
}: {
  props: AllTypesPropsType;
  returns: ReturnTypesType;
  ops: Operations;
  scalars?: ScalarDefinition;
  vars: Array<{ name: string; graphQLType: string }>;
}) => {
  const arb = (a: ZeusArgsType, p = '', root = true): string => {
    if (typeof a === 'string') {
      if (a.startsWith(START_VAR_NAME)) {
        const [varName, graphQLType] = a.replace(START_VAR_NAME, '$').split(GRAPHQL_TYPE_SEPARATOR);
        const v = vars.find((v) => v.name === varName);
        if (!v) {
          vars.push({
            name: varName,
            graphQLType,
          });
        } else {
          if (v.graphQLType !== graphQLType) {
            throw new Error(
              `Invalid variable exists with two different GraphQL Types, "${v.graphQLType}" and ${graphQLType}`,
            );
          }
        }
        return varName;
      }
    }
    const checkType = ResolveFromPath(props, returns, ops)(p);
    if (checkType.startsWith('scalar.')) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [_, ...splittedScalar] = checkType.split('.');
      const scalarKey = splittedScalar.join('.');
      return (scalars?.[scalarKey]?.encode?.(a) as string) || JSON.stringify(a);
    }
    if (Array.isArray(a)) {
      return `[${a.map((arr) => arb(arr, p, false)).join(', ')}]`;
    }
    if (typeof a === 'string') {
      if (checkType === 'enum') {
        return a;
      }
      return `${JSON.stringify(a)}`;
    }
    if (typeof a === 'object') {
      if (a === null) {
        return `null`;
      }
      const returnedObjectString = Object.entries(a)
        .filter(([, v]) => typeof v !== 'undefined')
        .map(([k, v]) => `${k}: ${arb(v, [p, k].join(SEPARATOR), false)}`)
        .join(',\n');
      if (!root) {
        return `{${returnedObjectString}}`;
      }
      return returnedObjectString;
    }
    return `${a}`;
  };
  return arb;
};

export const resolverFor = <X, T extends keyof ResolverInputTypes, Z extends keyof ResolverInputTypes[T]>(
  type: T,
  field: Z,
  fn: (
    args: Required<ResolverInputTypes[T]>[Z] extends [infer Input, any] ? Input : any,
    source: any,
  ) => Z extends keyof ModelTypes[T] ? ModelTypes[T][Z] | Promise<ModelTypes[T][Z]> | X : never,
) => fn as (args?: any, source?: any) => ReturnType<typeof fn>;

export type UnwrapPromise<T> = T extends Promise<infer R> ? R : T;
export type ZeusState<T extends (...args: any[]) => Promise<any>> = NonNullable<UnwrapPromise<ReturnType<T>>>;
export type ZeusHook<
  T extends (...args: any[]) => Record<string, (...args: any[]) => Promise<any>>,
  N extends keyof ReturnType<T>,
> = ZeusState<ReturnType<T>[N]>;

export type WithTypeNameValue<T> = T & {
  __typename?: boolean;
  __directives?: string;
};
export type AliasType<T> = WithTypeNameValue<T> & {
  __alias?: Record<string, WithTypeNameValue<T>>;
};
type DeepAnify<T> = {
  [P in keyof T]?: any;
};
type IsPayLoad<T> = T extends [any, infer PayLoad] ? PayLoad : T;
export type ScalarDefinition = Record<string, ScalarResolver>;

type IsScalar<S, SCLR extends ScalarDefinition> = S extends 'scalar' & { name: infer T }
  ? T extends keyof SCLR
    ? SCLR[T]['decode'] extends (s: unknown) => unknown
      ? ReturnType<SCLR[T]['decode']>
      : unknown
    : unknown
  : S;
type IsArray<T, U, SCLR extends ScalarDefinition> = T extends Array<infer R>
  ? InputType<R, U, SCLR>[]
  : InputType<T, U, SCLR>;
type FlattenArray<T> = T extends Array<infer R> ? R : T;
type BaseZeusResolver = boolean | 1 | string | Variable<any, string>;

type IsInterfaced<SRC extends DeepAnify<DST>, DST, SCLR extends ScalarDefinition> = FlattenArray<SRC> extends
  | ZEUS_INTERFACES
  | ZEUS_UNIONS
  ? {
      [P in keyof SRC]: SRC[P] extends '__union' & infer R
        ? P extends keyof DST
          ? IsArray<R, '__typename' extends keyof DST ? DST[P] & { __typename: true } : DST[P], SCLR>
          : IsArray<R, '__typename' extends keyof DST ? { __typename: true } : Record<string, never>, SCLR>
        : never;
    }[keyof SRC] & {
      [P in keyof Omit<
        Pick<
          SRC,
          {
            [P in keyof DST]: SRC[P] extends '__union' & infer R ? never : P;
          }[keyof DST]
        >,
        '__typename'
      >]: IsPayLoad<DST[P]> extends BaseZeusResolver ? IsScalar<SRC[P], SCLR> : IsArray<SRC[P], DST[P], SCLR>;
    }
  : {
      [P in keyof Pick<SRC, keyof DST>]: IsPayLoad<DST[P]> extends BaseZeusResolver
        ? IsScalar<SRC[P], SCLR>
        : IsArray<SRC[P], DST[P], SCLR>;
    };

export type MapType<SRC, DST, SCLR extends ScalarDefinition> = SRC extends DeepAnify<DST>
  ? IsInterfaced<SRC, DST, SCLR>
  : never;
// eslint-disable-next-line @typescript-eslint/ban-types
export type InputType<SRC, DST, SCLR extends ScalarDefinition = {}> = IsPayLoad<DST> extends { __alias: infer R }
  ? {
      [P in keyof R]: MapType<SRC, R[P], SCLR>[keyof MapType<SRC, R[P], SCLR>];
    } & MapType<SRC, Omit<IsPayLoad<DST>, '__alias'>, SCLR>
  : MapType<SRC, IsPayLoad<DST>, SCLR>;
export type SubscriptionToGraphQL<Z, T, SCLR extends ScalarDefinition> = {
  ws: WebSocket;
  on: (fn: (args: InputType<T, Z, SCLR>) => void) => void;
  off: (fn: (e: { data?: InputType<T, Z, SCLR>; code?: number; reason?: string; message?: string }) => void) => void;
  error: (fn: (e: { data?: InputType<T, Z, SCLR>; errors?: string[] }) => void) => void;
  open: () => void;
};

// eslint-disable-next-line @typescript-eslint/ban-types
export type FromSelector<SELECTOR, NAME extends keyof GraphQLTypes, SCLR extends ScalarDefinition = {}> = InputType<
  GraphQLTypes[NAME],
  SELECTOR,
  SCLR
>;

export type ScalarResolver = {
  encode?: (s: unknown) => string;
  decode?: (s: unknown) => unknown;
};

export type SelectionFunction<V> = <Z extends V>(
  t: Z & {
    [P in keyof Z]: P extends keyof V ? Z[P] : never;
  },
) => Z;

type BuiltInVariableTypes = {
  ['String']: string;
  ['Int']: number;
  ['Float']: number;
  ['ID']: unknown;
  ['Boolean']: boolean;
};
type AllVariableTypes = keyof BuiltInVariableTypes | keyof ZEUS_VARIABLES;
type VariableRequired<T extends string> = `${T}!` | T | `[${T}]` | `[${T}]!` | `[${T}!]` | `[${T}!]!`;
type VR<T extends string> = VariableRequired<VariableRequired<T>>;

export type GraphQLVariableType = VR<AllVariableTypes>;

type ExtractVariableTypeString<T extends string> = T extends VR<infer R1>
  ? R1 extends VR<infer R2>
    ? R2 extends VR<infer R3>
      ? R3 extends VR<infer R4>
        ? R4 extends VR<infer R5>
          ? R5
          : R4
        : R3
      : R2
    : R1
  : T;

type DecomposeType<T, Type> = T extends `[${infer R}]`
  ? Array<DecomposeType<R, Type>> | undefined
  : T extends `${infer R}!`
  ? NonNullable<DecomposeType<R, Type>>
  : Type | undefined;

type ExtractTypeFromGraphQLType<T extends string> = T extends keyof ZEUS_VARIABLES
  ? ZEUS_VARIABLES[T]
  : T extends keyof BuiltInVariableTypes
  ? BuiltInVariableTypes[T]
  : any;

export type GetVariableType<T extends string> = DecomposeType<
  T,
  ExtractTypeFromGraphQLType<ExtractVariableTypeString<T>>
>;

type UndefinedKeys<T> = {
  [K in keyof T]-?: T[K] extends NonNullable<T[K]> ? never : K;
}[keyof T];

type WithNullableKeys<T> = Pick<T, UndefinedKeys<T>>;
type WithNonNullableKeys<T> = Omit<T, UndefinedKeys<T>>;

type OptionalKeys<T> = {
  [P in keyof T]?: T[P];
};

export type WithOptionalNullables<T> = OptionalKeys<WithNullableKeys<T>> & WithNonNullableKeys<T>;

export type Variable<T extends GraphQLVariableType, Name extends string> = {
  ' __zeus_name': Name;
  ' __zeus_type': T;
};

export type ExtractVariablesDeep<Query> = Query extends Variable<infer VType, infer VName>
  ? { [key in VName]: GetVariableType<VType> }
  : Query extends string | number | boolean | Array<string | number | boolean>
  ? // eslint-disable-next-line @typescript-eslint/ban-types
    {}
  : UnionToIntersection<{ [K in keyof Query]: WithOptionalNullables<ExtractVariablesDeep<Query[K]>> }[keyof Query]>;

export type ExtractVariables<Query> = Query extends Variable<infer VType, infer VName>
  ? { [key in VName]: GetVariableType<VType> }
  : Query extends [infer Inputs, infer Outputs]
  ? ExtractVariablesDeep<Inputs> & ExtractVariables<Outputs>
  : Query extends string | number | boolean | Array<string | number | boolean>
  ? // eslint-disable-next-line @typescript-eslint/ban-types
    {}
  : UnionToIntersection<{ [K in keyof Query]: WithOptionalNullables<ExtractVariables<Query[K]>> }[keyof Query]>;

type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never;

export const START_VAR_NAME = `$ZEUS_VAR`;
export const GRAPHQL_TYPE_SEPARATOR = `__$GRAPHQL__`;

export const $ = <Type extends GraphQLVariableType, Name extends string>(name: Name, graphqlType: Type) => {
  return (START_VAR_NAME + name + GRAPHQL_TYPE_SEPARATOR + graphqlType) as unknown as Variable<Type, Name>;
};
type ZEUS_INTERFACES = never
export type ScalarCoders = {
	_text?: ScalarResolver;
	bpchar?: ScalarResolver;
	bytea?: ScalarResolver;
	date?: ScalarResolver;
	mpaa_rating?: ScalarResolver;
	numeric?: ScalarResolver;
	smallint?: ScalarResolver;
	timestamp?: ScalarResolver;
	tsvector?: ScalarResolver;
}
type ZEUS_UNIONS = never

export type ValueTypes = {
    /** Boolean expression to compare columns of type "Boolean". All fields are combined with logical 'AND'. */
["Boolean_comparison_exp"]: {
	_eq?: boolean | undefined | null | Variable<any, string>,
	_gt?: boolean | undefined | null | Variable<any, string>,
	_gte?: boolean | undefined | null | Variable<any, string>,
	_in?: Array<boolean> | undefined | null | Variable<any, string>,
	_is_null?: boolean | undefined | null | Variable<any, string>,
	_lt?: boolean | undefined | null | Variable<any, string>,
	_lte?: boolean | undefined | null | Variable<any, string>,
	_neq?: boolean | undefined | null | Variable<any, string>,
	_nin?: Array<boolean> | undefined | null | Variable<any, string>
};
	/** Boolean expression to compare columns of type "Int". All fields are combined with logical 'AND'. */
["Int_comparison_exp"]: {
	_eq?: number | undefined | null | Variable<any, string>,
	_gt?: number | undefined | null | Variable<any, string>,
	_gte?: number | undefined | null | Variable<any, string>,
	_in?: Array<number> | undefined | null | Variable<any, string>,
	_is_null?: boolean | undefined | null | Variable<any, string>,
	_lt?: number | undefined | null | Variable<any, string>,
	_lte?: number | undefined | null | Variable<any, string>,
	_neq?: number | undefined | null | Variable<any, string>,
	_nin?: Array<number> | undefined | null | Variable<any, string>
};
	/** Boolean expression to compare columns of type "String". All fields are combined with logical 'AND'. */
["String_comparison_exp"]: {
	_eq?: string | undefined | null | Variable<any, string>,
	_gt?: string | undefined | null | Variable<any, string>,
	_gte?: string | undefined | null | Variable<any, string>,
	/** does the column match the given case-insensitive pattern */
	_ilike?: string | undefined | null | Variable<any, string>,
	_in?: Array<string> | undefined | null | Variable<any, string>,
	/** does the column match the given POSIX regular expression, case insensitive */
	_iregex?: string | undefined | null | Variable<any, string>,
	_is_null?: boolean | undefined | null | Variable<any, string>,
	/** does the column match the given pattern */
	_like?: string | undefined | null | Variable<any, string>,
	_lt?: string | undefined | null | Variable<any, string>,
	_lte?: string | undefined | null | Variable<any, string>,
	_neq?: string | undefined | null | Variable<any, string>,
	/** does the column NOT match the given case-insensitive pattern */
	_nilike?: string | undefined | null | Variable<any, string>,
	_nin?: Array<string> | undefined | null | Variable<any, string>,
	/** does the column NOT match the given POSIX regular expression, case insensitive */
	_niregex?: string | undefined | null | Variable<any, string>,
	/** does the column NOT match the given pattern */
	_nlike?: string | undefined | null | Variable<any, string>,
	/** does the column NOT match the given POSIX regular expression, case sensitive */
	_nregex?: string | undefined | null | Variable<any, string>,
	/** does the column NOT match the given SQL regular expression */
	_nsimilar?: string | undefined | null | Variable<any, string>,
	/** does the column match the given POSIX regular expression, case sensitive */
	_regex?: string | undefined | null | Variable<any, string>,
	/** does the column match the given SQL regular expression */
	_similar?: string | undefined | null | Variable<any, string>
};
	["_text"]:unknown;
	/** Boolean expression to compare columns of type "_text". All fields are combined with logical 'AND'. */
["_text_comparison_exp"]: {
	_eq?: ValueTypes["_text"] | undefined | null | Variable<any, string>,
	_gt?: ValueTypes["_text"] | undefined | null | Variable<any, string>,
	_gte?: ValueTypes["_text"] | undefined | null | Variable<any, string>,
	_in?: Array<ValueTypes["_text"]> | undefined | null | Variable<any, string>,
	_is_null?: boolean | undefined | null | Variable<any, string>,
	_lt?: ValueTypes["_text"] | undefined | null | Variable<any, string>,
	_lte?: ValueTypes["_text"] | undefined | null | Variable<any, string>,
	_neq?: ValueTypes["_text"] | undefined | null | Variable<any, string>,
	_nin?: Array<ValueTypes["_text"]> | undefined | null | Variable<any, string>
};
	/** columns and relationships of "actor" */
["actor"]: AliasType<{
	actor_id?:boolean | `@${string}`,
	first_name?:boolean | `@${string}`,
	last_name?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregated selection of "actor" */
["actor_aggregate"]: AliasType<{
	aggregate?:ValueTypes["actor_aggregate_fields"],
	nodes?:ValueTypes["actor"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate fields of "actor" */
["actor_aggregate_fields"]: AliasType<{
	avg?:ValueTypes["actor_avg_fields"],
count?: [{	columns?: Array<ValueTypes["actor_select_column"]> | undefined | null | Variable<any, string>,	distinct?: boolean | undefined | null | Variable<any, string>},boolean | `@${string}`],
	max?:ValueTypes["actor_max_fields"],
	min?:ValueTypes["actor_min_fields"],
	stddev?:ValueTypes["actor_stddev_fields"],
	stddev_pop?:ValueTypes["actor_stddev_pop_fields"],
	stddev_samp?:ValueTypes["actor_stddev_samp_fields"],
	sum?:ValueTypes["actor_sum_fields"],
	var_pop?:ValueTypes["actor_var_pop_fields"],
	var_samp?:ValueTypes["actor_var_samp_fields"],
	variance?:ValueTypes["actor_variance_fields"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate avg on columns */
["actor_avg_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Boolean expression to filter rows from the table "actor". All fields are combined with a logical 'AND'. */
["actor_bool_exp"]: {
	_and?: Array<ValueTypes["actor_bool_exp"]> | undefined | null | Variable<any, string>,
	_not?: ValueTypes["actor_bool_exp"] | undefined | null | Variable<any, string>,
	_or?: Array<ValueTypes["actor_bool_exp"]> | undefined | null | Variable<any, string>,
	actor_id?: ValueTypes["Int_comparison_exp"] | undefined | null | Variable<any, string>,
	first_name?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
	last_name?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp_comparison_exp"] | undefined | null | Variable<any, string>
};
	/** unique or primary key constraints on table "actor" */
["actor_constraint"]:actor_constraint;
	/** input type for incrementing numeric columns in table "actor" */
["actor_inc_input"]: {
	actor_id?: number | undefined | null | Variable<any, string>
};
	/** columns and relationships of "actor_info" */
["actor_info"]: AliasType<{
	actor_id?:boolean | `@${string}`,
	film_info?:boolean | `@${string}`,
	first_name?:boolean | `@${string}`,
	last_name?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregated selection of "actor_info" */
["actor_info_aggregate"]: AliasType<{
	aggregate?:ValueTypes["actor_info_aggregate_fields"],
	nodes?:ValueTypes["actor_info"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate fields of "actor_info" */
["actor_info_aggregate_fields"]: AliasType<{
	avg?:ValueTypes["actor_info_avg_fields"],
count?: [{	columns?: Array<ValueTypes["actor_info_select_column"]> | undefined | null | Variable<any, string>,	distinct?: boolean | undefined | null | Variable<any, string>},boolean | `@${string}`],
	max?:ValueTypes["actor_info_max_fields"],
	min?:ValueTypes["actor_info_min_fields"],
	stddev?:ValueTypes["actor_info_stddev_fields"],
	stddev_pop?:ValueTypes["actor_info_stddev_pop_fields"],
	stddev_samp?:ValueTypes["actor_info_stddev_samp_fields"],
	sum?:ValueTypes["actor_info_sum_fields"],
	var_pop?:ValueTypes["actor_info_var_pop_fields"],
	var_samp?:ValueTypes["actor_info_var_samp_fields"],
	variance?:ValueTypes["actor_info_variance_fields"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate avg on columns */
["actor_info_avg_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Boolean expression to filter rows from the table "actor_info". All fields are combined with a logical 'AND'. */
["actor_info_bool_exp"]: {
	_and?: Array<ValueTypes["actor_info_bool_exp"]> | undefined | null | Variable<any, string>,
	_not?: ValueTypes["actor_info_bool_exp"] | undefined | null | Variable<any, string>,
	_or?: Array<ValueTypes["actor_info_bool_exp"]> | undefined | null | Variable<any, string>,
	actor_id?: ValueTypes["Int_comparison_exp"] | undefined | null | Variable<any, string>,
	film_info?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
	first_name?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
	last_name?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>
};
	/** aggregate max on columns */
["actor_info_max_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
	film_info?:boolean | `@${string}`,
	first_name?:boolean | `@${string}`,
	last_name?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate min on columns */
["actor_info_min_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
	film_info?:boolean | `@${string}`,
	first_name?:boolean | `@${string}`,
	last_name?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Ordering options when selecting data from "actor_info". */
["actor_info_order_by"]: {
	actor_id?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	film_info?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	first_name?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	last_name?: ValueTypes["order_by"] | undefined | null | Variable<any, string>
};
	/** select columns of table "actor_info" */
["actor_info_select_column"]:actor_info_select_column;
	/** aggregate stddev on columns */
["actor_info_stddev_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_pop on columns */
["actor_info_stddev_pop_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_samp on columns */
["actor_info_stddev_samp_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Streaming cursor of the table "actor_info" */
["actor_info_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ValueTypes["actor_info_stream_cursor_value_input"] | Variable<any, string>,
	/** cursor ordering */
	ordering?: ValueTypes["cursor_ordering"] | undefined | null | Variable<any, string>
};
	/** Initial value of the column from where the streaming should start */
["actor_info_stream_cursor_value_input"]: {
	actor_id?: number | undefined | null | Variable<any, string>,
	film_info?: string | undefined | null | Variable<any, string>,
	first_name?: string | undefined | null | Variable<any, string>,
	last_name?: string | undefined | null | Variable<any, string>
};
	/** aggregate sum on columns */
["actor_info_sum_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_pop on columns */
["actor_info_var_pop_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_samp on columns */
["actor_info_var_samp_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate variance on columns */
["actor_info_variance_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** input type for inserting data into table "actor" */
["actor_insert_input"]: {
	actor_id?: number | undefined | null | Variable<any, string>,
	first_name?: string | undefined | null | Variable<any, string>,
	last_name?: string | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>
};
	/** aggregate max on columns */
["actor_max_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
	first_name?:boolean | `@${string}`,
	last_name?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate min on columns */
["actor_min_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
	first_name?:boolean | `@${string}`,
	last_name?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** response of any mutation on the table "actor" */
["actor_mutation_response"]: AliasType<{
	/** number of rows affected by the mutation */
	affected_rows?:boolean | `@${string}`,
	/** data from the rows affected by the mutation */
	returning?:ValueTypes["actor"],
		__typename?: boolean | `@${string}`
}>;
	/** on_conflict condition type for table "actor" */
["actor_on_conflict"]: {
	constraint: ValueTypes["actor_constraint"] | Variable<any, string>,
	update_columns: Array<ValueTypes["actor_update_column"]> | Variable<any, string>,
	where?: ValueTypes["actor_bool_exp"] | undefined | null | Variable<any, string>
};
	/** Ordering options when selecting data from "actor". */
["actor_order_by"]: {
	actor_id?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	first_name?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	last_name?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["order_by"] | undefined | null | Variable<any, string>
};
	/** primary key columns input for table: actor */
["actor_pk_columns_input"]: {
	actor_id: number | Variable<any, string>
};
	/** select columns of table "actor" */
["actor_select_column"]:actor_select_column;
	/** input type for updating data in table "actor" */
["actor_set_input"]: {
	actor_id?: number | undefined | null | Variable<any, string>,
	first_name?: string | undefined | null | Variable<any, string>,
	last_name?: string | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>
};
	/** aggregate stddev on columns */
["actor_stddev_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_pop on columns */
["actor_stddev_pop_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_samp on columns */
["actor_stddev_samp_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Streaming cursor of the table "actor" */
["actor_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ValueTypes["actor_stream_cursor_value_input"] | Variable<any, string>,
	/** cursor ordering */
	ordering?: ValueTypes["cursor_ordering"] | undefined | null | Variable<any, string>
};
	/** Initial value of the column from where the streaming should start */
["actor_stream_cursor_value_input"]: {
	actor_id?: number | undefined | null | Variable<any, string>,
	first_name?: string | undefined | null | Variable<any, string>,
	last_name?: string | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>
};
	/** aggregate sum on columns */
["actor_sum_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** update columns of table "actor" */
["actor_update_column"]:actor_update_column;
	["actor_updates"]: {
	/** increments the numeric columns with given value of the filtered values */
	_inc?: ValueTypes["actor_inc_input"] | undefined | null | Variable<any, string>,
	/** sets the columns of the filtered rows to the given values */
	_set?: ValueTypes["actor_set_input"] | undefined | null | Variable<any, string>,
	/** filter the rows which have to be updated */
	where: ValueTypes["actor_bool_exp"] | Variable<any, string>
};
	/** aggregate var_pop on columns */
["actor_var_pop_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_samp on columns */
["actor_var_samp_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate variance on columns */
["actor_variance_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** columns and relationships of "address" */
["address"]: AliasType<{
	address?:boolean | `@${string}`,
	address2?:boolean | `@${string}`,
	address_id?:boolean | `@${string}`,
	city_id?:boolean | `@${string}`,
	district?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
	phone?:boolean | `@${string}`,
	postal_code?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregated selection of "address" */
["address_aggregate"]: AliasType<{
	aggregate?:ValueTypes["address_aggregate_fields"],
	nodes?:ValueTypes["address"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate fields of "address" */
["address_aggregate_fields"]: AliasType<{
	avg?:ValueTypes["address_avg_fields"],
count?: [{	columns?: Array<ValueTypes["address_select_column"]> | undefined | null | Variable<any, string>,	distinct?: boolean | undefined | null | Variable<any, string>},boolean | `@${string}`],
	max?:ValueTypes["address_max_fields"],
	min?:ValueTypes["address_min_fields"],
	stddev?:ValueTypes["address_stddev_fields"],
	stddev_pop?:ValueTypes["address_stddev_pop_fields"],
	stddev_samp?:ValueTypes["address_stddev_samp_fields"],
	sum?:ValueTypes["address_sum_fields"],
	var_pop?:ValueTypes["address_var_pop_fields"],
	var_samp?:ValueTypes["address_var_samp_fields"],
	variance?:ValueTypes["address_variance_fields"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate avg on columns */
["address_avg_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	city_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Boolean expression to filter rows from the table "address". All fields are combined with a logical 'AND'. */
["address_bool_exp"]: {
	_and?: Array<ValueTypes["address_bool_exp"]> | undefined | null | Variable<any, string>,
	_not?: ValueTypes["address_bool_exp"] | undefined | null | Variable<any, string>,
	_or?: Array<ValueTypes["address_bool_exp"]> | undefined | null | Variable<any, string>,
	address?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
	address2?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
	address_id?: ValueTypes["Int_comparison_exp"] | undefined | null | Variable<any, string>,
	city_id?: ValueTypes["smallint_comparison_exp"] | undefined | null | Variable<any, string>,
	district?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp_comparison_exp"] | undefined | null | Variable<any, string>,
	phone?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
	postal_code?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>
};
	/** unique or primary key constraints on table "address" */
["address_constraint"]:address_constraint;
	/** input type for incrementing numeric columns in table "address" */
["address_inc_input"]: {
	address_id?: number | undefined | null | Variable<any, string>,
	city_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>
};
	/** input type for inserting data into table "address" */
["address_insert_input"]: {
	address?: string | undefined | null | Variable<any, string>,
	address2?: string | undefined | null | Variable<any, string>,
	address_id?: number | undefined | null | Variable<any, string>,
	city_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	district?: string | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>,
	phone?: string | undefined | null | Variable<any, string>,
	postal_code?: string | undefined | null | Variable<any, string>
};
	/** aggregate max on columns */
["address_max_fields"]: AliasType<{
	address?:boolean | `@${string}`,
	address2?:boolean | `@${string}`,
	address_id?:boolean | `@${string}`,
	city_id?:boolean | `@${string}`,
	district?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
	phone?:boolean | `@${string}`,
	postal_code?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate min on columns */
["address_min_fields"]: AliasType<{
	address?:boolean | `@${string}`,
	address2?:boolean | `@${string}`,
	address_id?:boolean | `@${string}`,
	city_id?:boolean | `@${string}`,
	district?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
	phone?:boolean | `@${string}`,
	postal_code?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** response of any mutation on the table "address" */
["address_mutation_response"]: AliasType<{
	/** number of rows affected by the mutation */
	affected_rows?:boolean | `@${string}`,
	/** data from the rows affected by the mutation */
	returning?:ValueTypes["address"],
		__typename?: boolean | `@${string}`
}>;
	/** on_conflict condition type for table "address" */
["address_on_conflict"]: {
	constraint: ValueTypes["address_constraint"] | Variable<any, string>,
	update_columns: Array<ValueTypes["address_update_column"]> | Variable<any, string>,
	where?: ValueTypes["address_bool_exp"] | undefined | null | Variable<any, string>
};
	/** Ordering options when selecting data from "address". */
["address_order_by"]: {
	address?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	address2?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	address_id?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	city_id?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	district?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	phone?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	postal_code?: ValueTypes["order_by"] | undefined | null | Variable<any, string>
};
	/** primary key columns input for table: address */
["address_pk_columns_input"]: {
	address_id: number | Variable<any, string>
};
	/** select columns of table "address" */
["address_select_column"]:address_select_column;
	/** input type for updating data in table "address" */
["address_set_input"]: {
	address?: string | undefined | null | Variable<any, string>,
	address2?: string | undefined | null | Variable<any, string>,
	address_id?: number | undefined | null | Variable<any, string>,
	city_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	district?: string | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>,
	phone?: string | undefined | null | Variable<any, string>,
	postal_code?: string | undefined | null | Variable<any, string>
};
	/** aggregate stddev on columns */
["address_stddev_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	city_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_pop on columns */
["address_stddev_pop_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	city_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_samp on columns */
["address_stddev_samp_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	city_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Streaming cursor of the table "address" */
["address_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ValueTypes["address_stream_cursor_value_input"] | Variable<any, string>,
	/** cursor ordering */
	ordering?: ValueTypes["cursor_ordering"] | undefined | null | Variable<any, string>
};
	/** Initial value of the column from where the streaming should start */
["address_stream_cursor_value_input"]: {
	address?: string | undefined | null | Variable<any, string>,
	address2?: string | undefined | null | Variable<any, string>,
	address_id?: number | undefined | null | Variable<any, string>,
	city_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	district?: string | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>,
	phone?: string | undefined | null | Variable<any, string>,
	postal_code?: string | undefined | null | Variable<any, string>
};
	/** aggregate sum on columns */
["address_sum_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	city_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** update columns of table "address" */
["address_update_column"]:address_update_column;
	["address_updates"]: {
	/** increments the numeric columns with given value of the filtered values */
	_inc?: ValueTypes["address_inc_input"] | undefined | null | Variable<any, string>,
	/** sets the columns of the filtered rows to the given values */
	_set?: ValueTypes["address_set_input"] | undefined | null | Variable<any, string>,
	/** filter the rows which have to be updated */
	where: ValueTypes["address_bool_exp"] | Variable<any, string>
};
	/** aggregate var_pop on columns */
["address_var_pop_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	city_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_samp on columns */
["address_var_samp_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	city_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate variance on columns */
["address_variance_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	city_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	["bpchar"]:unknown;
	/** Boolean expression to compare columns of type "bpchar". All fields are combined with logical 'AND'. */
["bpchar_comparison_exp"]: {
	_eq?: ValueTypes["bpchar"] | undefined | null | Variable<any, string>,
	_gt?: ValueTypes["bpchar"] | undefined | null | Variable<any, string>,
	_gte?: ValueTypes["bpchar"] | undefined | null | Variable<any, string>,
	/** does the column match the given case-insensitive pattern */
	_ilike?: ValueTypes["bpchar"] | undefined | null | Variable<any, string>,
	_in?: Array<ValueTypes["bpchar"]> | undefined | null | Variable<any, string>,
	/** does the column match the given POSIX regular expression, case insensitive */
	_iregex?: ValueTypes["bpchar"] | undefined | null | Variable<any, string>,
	_is_null?: boolean | undefined | null | Variable<any, string>,
	/** does the column match the given pattern */
	_like?: ValueTypes["bpchar"] | undefined | null | Variable<any, string>,
	_lt?: ValueTypes["bpchar"] | undefined | null | Variable<any, string>,
	_lte?: ValueTypes["bpchar"] | undefined | null | Variable<any, string>,
	_neq?: ValueTypes["bpchar"] | undefined | null | Variable<any, string>,
	/** does the column NOT match the given case-insensitive pattern */
	_nilike?: ValueTypes["bpchar"] | undefined | null | Variable<any, string>,
	_nin?: Array<ValueTypes["bpchar"]> | undefined | null | Variable<any, string>,
	/** does the column NOT match the given POSIX regular expression, case insensitive */
	_niregex?: ValueTypes["bpchar"] | undefined | null | Variable<any, string>,
	/** does the column NOT match the given pattern */
	_nlike?: ValueTypes["bpchar"] | undefined | null | Variable<any, string>,
	/** does the column NOT match the given POSIX regular expression, case sensitive */
	_nregex?: ValueTypes["bpchar"] | undefined | null | Variable<any, string>,
	/** does the column NOT match the given SQL regular expression */
	_nsimilar?: ValueTypes["bpchar"] | undefined | null | Variable<any, string>,
	/** does the column match the given POSIX regular expression, case sensitive */
	_regex?: ValueTypes["bpchar"] | undefined | null | Variable<any, string>,
	/** does the column match the given SQL regular expression */
	_similar?: ValueTypes["bpchar"] | undefined | null | Variable<any, string>
};
	["bytea"]:unknown;
	/** Boolean expression to compare columns of type "bytea". All fields are combined with logical 'AND'. */
["bytea_comparison_exp"]: {
	_eq?: ValueTypes["bytea"] | undefined | null | Variable<any, string>,
	_gt?: ValueTypes["bytea"] | undefined | null | Variable<any, string>,
	_gte?: ValueTypes["bytea"] | undefined | null | Variable<any, string>,
	_in?: Array<ValueTypes["bytea"]> | undefined | null | Variable<any, string>,
	_is_null?: boolean | undefined | null | Variable<any, string>,
	_lt?: ValueTypes["bytea"] | undefined | null | Variable<any, string>,
	_lte?: ValueTypes["bytea"] | undefined | null | Variable<any, string>,
	_neq?: ValueTypes["bytea"] | undefined | null | Variable<any, string>,
	_nin?: Array<ValueTypes["bytea"]> | undefined | null | Variable<any, string>
};
	/** columns and relationships of "category" */
["category"]: AliasType<{
	category_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
	name?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregated selection of "category" */
["category_aggregate"]: AliasType<{
	aggregate?:ValueTypes["category_aggregate_fields"],
	nodes?:ValueTypes["category"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate fields of "category" */
["category_aggregate_fields"]: AliasType<{
	avg?:ValueTypes["category_avg_fields"],
count?: [{	columns?: Array<ValueTypes["category_select_column"]> | undefined | null | Variable<any, string>,	distinct?: boolean | undefined | null | Variable<any, string>},boolean | `@${string}`],
	max?:ValueTypes["category_max_fields"],
	min?:ValueTypes["category_min_fields"],
	stddev?:ValueTypes["category_stddev_fields"],
	stddev_pop?:ValueTypes["category_stddev_pop_fields"],
	stddev_samp?:ValueTypes["category_stddev_samp_fields"],
	sum?:ValueTypes["category_sum_fields"],
	var_pop?:ValueTypes["category_var_pop_fields"],
	var_samp?:ValueTypes["category_var_samp_fields"],
	variance?:ValueTypes["category_variance_fields"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate avg on columns */
["category_avg_fields"]: AliasType<{
	category_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Boolean expression to filter rows from the table "category". All fields are combined with a logical 'AND'. */
["category_bool_exp"]: {
	_and?: Array<ValueTypes["category_bool_exp"]> | undefined | null | Variable<any, string>,
	_not?: ValueTypes["category_bool_exp"] | undefined | null | Variable<any, string>,
	_or?: Array<ValueTypes["category_bool_exp"]> | undefined | null | Variable<any, string>,
	category_id?: ValueTypes["Int_comparison_exp"] | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp_comparison_exp"] | undefined | null | Variable<any, string>,
	name?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>
};
	/** unique or primary key constraints on table "category" */
["category_constraint"]:category_constraint;
	/** input type for incrementing numeric columns in table "category" */
["category_inc_input"]: {
	category_id?: number | undefined | null | Variable<any, string>
};
	/** input type for inserting data into table "category" */
["category_insert_input"]: {
	category_id?: number | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>,
	name?: string | undefined | null | Variable<any, string>
};
	/** aggregate max on columns */
["category_max_fields"]: AliasType<{
	category_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
	name?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate min on columns */
["category_min_fields"]: AliasType<{
	category_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
	name?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** response of any mutation on the table "category" */
["category_mutation_response"]: AliasType<{
	/** number of rows affected by the mutation */
	affected_rows?:boolean | `@${string}`,
	/** data from the rows affected by the mutation */
	returning?:ValueTypes["category"],
		__typename?: boolean | `@${string}`
}>;
	/** on_conflict condition type for table "category" */
["category_on_conflict"]: {
	constraint: ValueTypes["category_constraint"] | Variable<any, string>,
	update_columns: Array<ValueTypes["category_update_column"]> | Variable<any, string>,
	where?: ValueTypes["category_bool_exp"] | undefined | null | Variable<any, string>
};
	/** Ordering options when selecting data from "category". */
["category_order_by"]: {
	category_id?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	name?: ValueTypes["order_by"] | undefined | null | Variable<any, string>
};
	/** primary key columns input for table: category */
["category_pk_columns_input"]: {
	category_id: number | Variable<any, string>
};
	/** select columns of table "category" */
["category_select_column"]:category_select_column;
	/** input type for updating data in table "category" */
["category_set_input"]: {
	category_id?: number | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>,
	name?: string | undefined | null | Variable<any, string>
};
	/** aggregate stddev on columns */
["category_stddev_fields"]: AliasType<{
	category_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_pop on columns */
["category_stddev_pop_fields"]: AliasType<{
	category_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_samp on columns */
["category_stddev_samp_fields"]: AliasType<{
	category_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Streaming cursor of the table "category" */
["category_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ValueTypes["category_stream_cursor_value_input"] | Variable<any, string>,
	/** cursor ordering */
	ordering?: ValueTypes["cursor_ordering"] | undefined | null | Variable<any, string>
};
	/** Initial value of the column from where the streaming should start */
["category_stream_cursor_value_input"]: {
	category_id?: number | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>,
	name?: string | undefined | null | Variable<any, string>
};
	/** aggregate sum on columns */
["category_sum_fields"]: AliasType<{
	category_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** update columns of table "category" */
["category_update_column"]:category_update_column;
	["category_updates"]: {
	/** increments the numeric columns with given value of the filtered values */
	_inc?: ValueTypes["category_inc_input"] | undefined | null | Variable<any, string>,
	/** sets the columns of the filtered rows to the given values */
	_set?: ValueTypes["category_set_input"] | undefined | null | Variable<any, string>,
	/** filter the rows which have to be updated */
	where: ValueTypes["category_bool_exp"] | Variable<any, string>
};
	/** aggregate var_pop on columns */
["category_var_pop_fields"]: AliasType<{
	category_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_samp on columns */
["category_var_samp_fields"]: AliasType<{
	category_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate variance on columns */
["category_variance_fields"]: AliasType<{
	category_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** columns and relationships of "city" */
["city"]: AliasType<{
	city?:boolean | `@${string}`,
	city_id?:boolean | `@${string}`,
	country_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregated selection of "city" */
["city_aggregate"]: AliasType<{
	aggregate?:ValueTypes["city_aggregate_fields"],
	nodes?:ValueTypes["city"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate fields of "city" */
["city_aggregate_fields"]: AliasType<{
	avg?:ValueTypes["city_avg_fields"],
count?: [{	columns?: Array<ValueTypes["city_select_column"]> | undefined | null | Variable<any, string>,	distinct?: boolean | undefined | null | Variable<any, string>},boolean | `@${string}`],
	max?:ValueTypes["city_max_fields"],
	min?:ValueTypes["city_min_fields"],
	stddev?:ValueTypes["city_stddev_fields"],
	stddev_pop?:ValueTypes["city_stddev_pop_fields"],
	stddev_samp?:ValueTypes["city_stddev_samp_fields"],
	sum?:ValueTypes["city_sum_fields"],
	var_pop?:ValueTypes["city_var_pop_fields"],
	var_samp?:ValueTypes["city_var_samp_fields"],
	variance?:ValueTypes["city_variance_fields"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate avg on columns */
["city_avg_fields"]: AliasType<{
	city_id?:boolean | `@${string}`,
	country_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Boolean expression to filter rows from the table "city". All fields are combined with a logical 'AND'. */
["city_bool_exp"]: {
	_and?: Array<ValueTypes["city_bool_exp"]> | undefined | null | Variable<any, string>,
	_not?: ValueTypes["city_bool_exp"] | undefined | null | Variable<any, string>,
	_or?: Array<ValueTypes["city_bool_exp"]> | undefined | null | Variable<any, string>,
	city?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
	city_id?: ValueTypes["Int_comparison_exp"] | undefined | null | Variable<any, string>,
	country_id?: ValueTypes["smallint_comparison_exp"] | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp_comparison_exp"] | undefined | null | Variable<any, string>
};
	/** unique or primary key constraints on table "city" */
["city_constraint"]:city_constraint;
	/** input type for incrementing numeric columns in table "city" */
["city_inc_input"]: {
	city_id?: number | undefined | null | Variable<any, string>,
	country_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>
};
	/** input type for inserting data into table "city" */
["city_insert_input"]: {
	city?: string | undefined | null | Variable<any, string>,
	city_id?: number | undefined | null | Variable<any, string>,
	country_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>
};
	/** aggregate max on columns */
["city_max_fields"]: AliasType<{
	city?:boolean | `@${string}`,
	city_id?:boolean | `@${string}`,
	country_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate min on columns */
["city_min_fields"]: AliasType<{
	city?:boolean | `@${string}`,
	city_id?:boolean | `@${string}`,
	country_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** response of any mutation on the table "city" */
["city_mutation_response"]: AliasType<{
	/** number of rows affected by the mutation */
	affected_rows?:boolean | `@${string}`,
	/** data from the rows affected by the mutation */
	returning?:ValueTypes["city"],
		__typename?: boolean | `@${string}`
}>;
	/** on_conflict condition type for table "city" */
["city_on_conflict"]: {
	constraint: ValueTypes["city_constraint"] | Variable<any, string>,
	update_columns: Array<ValueTypes["city_update_column"]> | Variable<any, string>,
	where?: ValueTypes["city_bool_exp"] | undefined | null | Variable<any, string>
};
	/** Ordering options when selecting data from "city". */
["city_order_by"]: {
	city?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	city_id?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	country_id?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["order_by"] | undefined | null | Variable<any, string>
};
	/** primary key columns input for table: city */
["city_pk_columns_input"]: {
	city_id: number | Variable<any, string>
};
	/** select columns of table "city" */
["city_select_column"]:city_select_column;
	/** input type for updating data in table "city" */
["city_set_input"]: {
	city?: string | undefined | null | Variable<any, string>,
	city_id?: number | undefined | null | Variable<any, string>,
	country_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>
};
	/** aggregate stddev on columns */
["city_stddev_fields"]: AliasType<{
	city_id?:boolean | `@${string}`,
	country_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_pop on columns */
["city_stddev_pop_fields"]: AliasType<{
	city_id?:boolean | `@${string}`,
	country_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_samp on columns */
["city_stddev_samp_fields"]: AliasType<{
	city_id?:boolean | `@${string}`,
	country_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Streaming cursor of the table "city" */
["city_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ValueTypes["city_stream_cursor_value_input"] | Variable<any, string>,
	/** cursor ordering */
	ordering?: ValueTypes["cursor_ordering"] | undefined | null | Variable<any, string>
};
	/** Initial value of the column from where the streaming should start */
["city_stream_cursor_value_input"]: {
	city?: string | undefined | null | Variable<any, string>,
	city_id?: number | undefined | null | Variable<any, string>,
	country_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>
};
	/** aggregate sum on columns */
["city_sum_fields"]: AliasType<{
	city_id?:boolean | `@${string}`,
	country_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** update columns of table "city" */
["city_update_column"]:city_update_column;
	["city_updates"]: {
	/** increments the numeric columns with given value of the filtered values */
	_inc?: ValueTypes["city_inc_input"] | undefined | null | Variable<any, string>,
	/** sets the columns of the filtered rows to the given values */
	_set?: ValueTypes["city_set_input"] | undefined | null | Variable<any, string>,
	/** filter the rows which have to be updated */
	where: ValueTypes["city_bool_exp"] | Variable<any, string>
};
	/** aggregate var_pop on columns */
["city_var_pop_fields"]: AliasType<{
	city_id?:boolean | `@${string}`,
	country_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_samp on columns */
["city_var_samp_fields"]: AliasType<{
	city_id?:boolean | `@${string}`,
	country_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate variance on columns */
["city_variance_fields"]: AliasType<{
	city_id?:boolean | `@${string}`,
	country_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** columns and relationships of "country" */
["country"]: AliasType<{
	country?:boolean | `@${string}`,
	country_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregated selection of "country" */
["country_aggregate"]: AliasType<{
	aggregate?:ValueTypes["country_aggregate_fields"],
	nodes?:ValueTypes["country"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate fields of "country" */
["country_aggregate_fields"]: AliasType<{
	avg?:ValueTypes["country_avg_fields"],
count?: [{	columns?: Array<ValueTypes["country_select_column"]> | undefined | null | Variable<any, string>,	distinct?: boolean | undefined | null | Variable<any, string>},boolean | `@${string}`],
	max?:ValueTypes["country_max_fields"],
	min?:ValueTypes["country_min_fields"],
	stddev?:ValueTypes["country_stddev_fields"],
	stddev_pop?:ValueTypes["country_stddev_pop_fields"],
	stddev_samp?:ValueTypes["country_stddev_samp_fields"],
	sum?:ValueTypes["country_sum_fields"],
	var_pop?:ValueTypes["country_var_pop_fields"],
	var_samp?:ValueTypes["country_var_samp_fields"],
	variance?:ValueTypes["country_variance_fields"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate avg on columns */
["country_avg_fields"]: AliasType<{
	country_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Boolean expression to filter rows from the table "country". All fields are combined with a logical 'AND'. */
["country_bool_exp"]: {
	_and?: Array<ValueTypes["country_bool_exp"]> | undefined | null | Variable<any, string>,
	_not?: ValueTypes["country_bool_exp"] | undefined | null | Variable<any, string>,
	_or?: Array<ValueTypes["country_bool_exp"]> | undefined | null | Variable<any, string>,
	country?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
	country_id?: ValueTypes["Int_comparison_exp"] | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp_comparison_exp"] | undefined | null | Variable<any, string>
};
	/** unique or primary key constraints on table "country" */
["country_constraint"]:country_constraint;
	/** input type for incrementing numeric columns in table "country" */
["country_inc_input"]: {
	country_id?: number | undefined | null | Variable<any, string>
};
	/** input type for inserting data into table "country" */
["country_insert_input"]: {
	country?: string | undefined | null | Variable<any, string>,
	country_id?: number | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>
};
	/** aggregate max on columns */
["country_max_fields"]: AliasType<{
	country?:boolean | `@${string}`,
	country_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate min on columns */
["country_min_fields"]: AliasType<{
	country?:boolean | `@${string}`,
	country_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** response of any mutation on the table "country" */
["country_mutation_response"]: AliasType<{
	/** number of rows affected by the mutation */
	affected_rows?:boolean | `@${string}`,
	/** data from the rows affected by the mutation */
	returning?:ValueTypes["country"],
		__typename?: boolean | `@${string}`
}>;
	/** on_conflict condition type for table "country" */
["country_on_conflict"]: {
	constraint: ValueTypes["country_constraint"] | Variable<any, string>,
	update_columns: Array<ValueTypes["country_update_column"]> | Variable<any, string>,
	where?: ValueTypes["country_bool_exp"] | undefined | null | Variable<any, string>
};
	/** Ordering options when selecting data from "country". */
["country_order_by"]: {
	country?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	country_id?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["order_by"] | undefined | null | Variable<any, string>
};
	/** primary key columns input for table: country */
["country_pk_columns_input"]: {
	country_id: number | Variable<any, string>
};
	/** select columns of table "country" */
["country_select_column"]:country_select_column;
	/** input type for updating data in table "country" */
["country_set_input"]: {
	country?: string | undefined | null | Variable<any, string>,
	country_id?: number | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>
};
	/** aggregate stddev on columns */
["country_stddev_fields"]: AliasType<{
	country_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_pop on columns */
["country_stddev_pop_fields"]: AliasType<{
	country_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_samp on columns */
["country_stddev_samp_fields"]: AliasType<{
	country_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Streaming cursor of the table "country" */
["country_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ValueTypes["country_stream_cursor_value_input"] | Variable<any, string>,
	/** cursor ordering */
	ordering?: ValueTypes["cursor_ordering"] | undefined | null | Variable<any, string>
};
	/** Initial value of the column from where the streaming should start */
["country_stream_cursor_value_input"]: {
	country?: string | undefined | null | Variable<any, string>,
	country_id?: number | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>
};
	/** aggregate sum on columns */
["country_sum_fields"]: AliasType<{
	country_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** update columns of table "country" */
["country_update_column"]:country_update_column;
	["country_updates"]: {
	/** increments the numeric columns with given value of the filtered values */
	_inc?: ValueTypes["country_inc_input"] | undefined | null | Variable<any, string>,
	/** sets the columns of the filtered rows to the given values */
	_set?: ValueTypes["country_set_input"] | undefined | null | Variable<any, string>,
	/** filter the rows which have to be updated */
	where: ValueTypes["country_bool_exp"] | Variable<any, string>
};
	/** aggregate var_pop on columns */
["country_var_pop_fields"]: AliasType<{
	country_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_samp on columns */
["country_var_samp_fields"]: AliasType<{
	country_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate variance on columns */
["country_variance_fields"]: AliasType<{
	country_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** ordering argument of a cursor */
["cursor_ordering"]:cursor_ordering;
	/** columns and relationships of "customer" */
["customer"]: AliasType<{
	active?:boolean | `@${string}`,
	activebool?:boolean | `@${string}`,
	address_id?:boolean | `@${string}`,
	create_date?:boolean | `@${string}`,
	customer_id?:boolean | `@${string}`,
	email?:boolean | `@${string}`,
	first_name?:boolean | `@${string}`,
	last_name?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregated selection of "customer" */
["customer_aggregate"]: AliasType<{
	aggregate?:ValueTypes["customer_aggregate_fields"],
	nodes?:ValueTypes["customer"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate fields of "customer" */
["customer_aggregate_fields"]: AliasType<{
	avg?:ValueTypes["customer_avg_fields"],
count?: [{	columns?: Array<ValueTypes["customer_select_column"]> | undefined | null | Variable<any, string>,	distinct?: boolean | undefined | null | Variable<any, string>},boolean | `@${string}`],
	max?:ValueTypes["customer_max_fields"],
	min?:ValueTypes["customer_min_fields"],
	stddev?:ValueTypes["customer_stddev_fields"],
	stddev_pop?:ValueTypes["customer_stddev_pop_fields"],
	stddev_samp?:ValueTypes["customer_stddev_samp_fields"],
	sum?:ValueTypes["customer_sum_fields"],
	var_pop?:ValueTypes["customer_var_pop_fields"],
	var_samp?:ValueTypes["customer_var_samp_fields"],
	variance?:ValueTypes["customer_variance_fields"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate avg on columns */
["customer_avg_fields"]: AliasType<{
	active?:boolean | `@${string}`,
	address_id?:boolean | `@${string}`,
	customer_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Boolean expression to filter rows from the table "customer". All fields are combined with a logical 'AND'. */
["customer_bool_exp"]: {
	_and?: Array<ValueTypes["customer_bool_exp"]> | undefined | null | Variable<any, string>,
	_not?: ValueTypes["customer_bool_exp"] | undefined | null | Variable<any, string>,
	_or?: Array<ValueTypes["customer_bool_exp"]> | undefined | null | Variable<any, string>,
	active?: ValueTypes["Int_comparison_exp"] | undefined | null | Variable<any, string>,
	activebool?: ValueTypes["Boolean_comparison_exp"] | undefined | null | Variable<any, string>,
	address_id?: ValueTypes["smallint_comparison_exp"] | undefined | null | Variable<any, string>,
	create_date?: ValueTypes["date_comparison_exp"] | undefined | null | Variable<any, string>,
	customer_id?: ValueTypes["Int_comparison_exp"] | undefined | null | Variable<any, string>,
	email?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
	first_name?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
	last_name?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp_comparison_exp"] | undefined | null | Variable<any, string>,
	store_id?: ValueTypes["smallint_comparison_exp"] | undefined | null | Variable<any, string>
};
	/** unique or primary key constraints on table "customer" */
["customer_constraint"]:customer_constraint;
	/** input type for incrementing numeric columns in table "customer" */
["customer_inc_input"]: {
	active?: number | undefined | null | Variable<any, string>,
	address_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	customer_id?: number | undefined | null | Variable<any, string>,
	store_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>
};
	/** input type for inserting data into table "customer" */
["customer_insert_input"]: {
	active?: number | undefined | null | Variable<any, string>,
	activebool?: boolean | undefined | null | Variable<any, string>,
	address_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	create_date?: ValueTypes["date"] | undefined | null | Variable<any, string>,
	customer_id?: number | undefined | null | Variable<any, string>,
	email?: string | undefined | null | Variable<any, string>,
	first_name?: string | undefined | null | Variable<any, string>,
	last_name?: string | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>,
	store_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>
};
	/** columns and relationships of "customer_list" */
["customer_list"]: AliasType<{
	address?:boolean | `@${string}`,
	city?:boolean | `@${string}`,
	country?:boolean | `@${string}`,
	id?:boolean | `@${string}`,
	name?:boolean | `@${string}`,
	notes?:boolean | `@${string}`,
	phone?:boolean | `@${string}`,
	sid?:boolean | `@${string}`,
	zip_code?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregated selection of "customer_list" */
["customer_list_aggregate"]: AliasType<{
	aggregate?:ValueTypes["customer_list_aggregate_fields"],
	nodes?:ValueTypes["customer_list"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate fields of "customer_list" */
["customer_list_aggregate_fields"]: AliasType<{
	avg?:ValueTypes["customer_list_avg_fields"],
count?: [{	columns?: Array<ValueTypes["customer_list_select_column"]> | undefined | null | Variable<any, string>,	distinct?: boolean | undefined | null | Variable<any, string>},boolean | `@${string}`],
	max?:ValueTypes["customer_list_max_fields"],
	min?:ValueTypes["customer_list_min_fields"],
	stddev?:ValueTypes["customer_list_stddev_fields"],
	stddev_pop?:ValueTypes["customer_list_stddev_pop_fields"],
	stddev_samp?:ValueTypes["customer_list_stddev_samp_fields"],
	sum?:ValueTypes["customer_list_sum_fields"],
	var_pop?:ValueTypes["customer_list_var_pop_fields"],
	var_samp?:ValueTypes["customer_list_var_samp_fields"],
	variance?:ValueTypes["customer_list_variance_fields"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate avg on columns */
["customer_list_avg_fields"]: AliasType<{
	id?:boolean | `@${string}`,
	sid?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Boolean expression to filter rows from the table "customer_list". All fields are combined with a logical 'AND'. */
["customer_list_bool_exp"]: {
	_and?: Array<ValueTypes["customer_list_bool_exp"]> | undefined | null | Variable<any, string>,
	_not?: ValueTypes["customer_list_bool_exp"] | undefined | null | Variable<any, string>,
	_or?: Array<ValueTypes["customer_list_bool_exp"]> | undefined | null | Variable<any, string>,
	address?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
	city?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
	country?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
	id?: ValueTypes["Int_comparison_exp"] | undefined | null | Variable<any, string>,
	name?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
	notes?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
	phone?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
	sid?: ValueTypes["smallint_comparison_exp"] | undefined | null | Variable<any, string>,
	zip_code?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>
};
	/** aggregate max on columns */
["customer_list_max_fields"]: AliasType<{
	address?:boolean | `@${string}`,
	city?:boolean | `@${string}`,
	country?:boolean | `@${string}`,
	id?:boolean | `@${string}`,
	name?:boolean | `@${string}`,
	notes?:boolean | `@${string}`,
	phone?:boolean | `@${string}`,
	sid?:boolean | `@${string}`,
	zip_code?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate min on columns */
["customer_list_min_fields"]: AliasType<{
	address?:boolean | `@${string}`,
	city?:boolean | `@${string}`,
	country?:boolean | `@${string}`,
	id?:boolean | `@${string}`,
	name?:boolean | `@${string}`,
	notes?:boolean | `@${string}`,
	phone?:boolean | `@${string}`,
	sid?:boolean | `@${string}`,
	zip_code?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Ordering options when selecting data from "customer_list". */
["customer_list_order_by"]: {
	address?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	city?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	country?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	id?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	name?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	notes?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	phone?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	sid?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	zip_code?: ValueTypes["order_by"] | undefined | null | Variable<any, string>
};
	/** select columns of table "customer_list" */
["customer_list_select_column"]:customer_list_select_column;
	/** aggregate stddev on columns */
["customer_list_stddev_fields"]: AliasType<{
	id?:boolean | `@${string}`,
	sid?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_pop on columns */
["customer_list_stddev_pop_fields"]: AliasType<{
	id?:boolean | `@${string}`,
	sid?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_samp on columns */
["customer_list_stddev_samp_fields"]: AliasType<{
	id?:boolean | `@${string}`,
	sid?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Streaming cursor of the table "customer_list" */
["customer_list_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ValueTypes["customer_list_stream_cursor_value_input"] | Variable<any, string>,
	/** cursor ordering */
	ordering?: ValueTypes["cursor_ordering"] | undefined | null | Variable<any, string>
};
	/** Initial value of the column from where the streaming should start */
["customer_list_stream_cursor_value_input"]: {
	address?: string | undefined | null | Variable<any, string>,
	city?: string | undefined | null | Variable<any, string>,
	country?: string | undefined | null | Variable<any, string>,
	id?: number | undefined | null | Variable<any, string>,
	name?: string | undefined | null | Variable<any, string>,
	notes?: string | undefined | null | Variable<any, string>,
	phone?: string | undefined | null | Variable<any, string>,
	sid?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	zip_code?: string | undefined | null | Variable<any, string>
};
	/** aggregate sum on columns */
["customer_list_sum_fields"]: AliasType<{
	id?:boolean | `@${string}`,
	sid?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_pop on columns */
["customer_list_var_pop_fields"]: AliasType<{
	id?:boolean | `@${string}`,
	sid?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_samp on columns */
["customer_list_var_samp_fields"]: AliasType<{
	id?:boolean | `@${string}`,
	sid?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate variance on columns */
["customer_list_variance_fields"]: AliasType<{
	id?:boolean | `@${string}`,
	sid?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate max on columns */
["customer_max_fields"]: AliasType<{
	active?:boolean | `@${string}`,
	address_id?:boolean | `@${string}`,
	create_date?:boolean | `@${string}`,
	customer_id?:boolean | `@${string}`,
	email?:boolean | `@${string}`,
	first_name?:boolean | `@${string}`,
	last_name?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate min on columns */
["customer_min_fields"]: AliasType<{
	active?:boolean | `@${string}`,
	address_id?:boolean | `@${string}`,
	create_date?:boolean | `@${string}`,
	customer_id?:boolean | `@${string}`,
	email?:boolean | `@${string}`,
	first_name?:boolean | `@${string}`,
	last_name?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** response of any mutation on the table "customer" */
["customer_mutation_response"]: AliasType<{
	/** number of rows affected by the mutation */
	affected_rows?:boolean | `@${string}`,
	/** data from the rows affected by the mutation */
	returning?:ValueTypes["customer"],
		__typename?: boolean | `@${string}`
}>;
	/** on_conflict condition type for table "customer" */
["customer_on_conflict"]: {
	constraint: ValueTypes["customer_constraint"] | Variable<any, string>,
	update_columns: Array<ValueTypes["customer_update_column"]> | Variable<any, string>,
	where?: ValueTypes["customer_bool_exp"] | undefined | null | Variable<any, string>
};
	/** Ordering options when selecting data from "customer". */
["customer_order_by"]: {
	active?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	activebool?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	address_id?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	create_date?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	customer_id?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	email?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	first_name?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	last_name?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	store_id?: ValueTypes["order_by"] | undefined | null | Variable<any, string>
};
	/** primary key columns input for table: customer */
["customer_pk_columns_input"]: {
	customer_id: number | Variable<any, string>
};
	/** select columns of table "customer" */
["customer_select_column"]:customer_select_column;
	/** input type for updating data in table "customer" */
["customer_set_input"]: {
	active?: number | undefined | null | Variable<any, string>,
	activebool?: boolean | undefined | null | Variable<any, string>,
	address_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	create_date?: ValueTypes["date"] | undefined | null | Variable<any, string>,
	customer_id?: number | undefined | null | Variable<any, string>,
	email?: string | undefined | null | Variable<any, string>,
	first_name?: string | undefined | null | Variable<any, string>,
	last_name?: string | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>,
	store_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>
};
	/** aggregate stddev on columns */
["customer_stddev_fields"]: AliasType<{
	active?:boolean | `@${string}`,
	address_id?:boolean | `@${string}`,
	customer_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_pop on columns */
["customer_stddev_pop_fields"]: AliasType<{
	active?:boolean | `@${string}`,
	address_id?:boolean | `@${string}`,
	customer_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_samp on columns */
["customer_stddev_samp_fields"]: AliasType<{
	active?:boolean | `@${string}`,
	address_id?:boolean | `@${string}`,
	customer_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Streaming cursor of the table "customer" */
["customer_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ValueTypes["customer_stream_cursor_value_input"] | Variable<any, string>,
	/** cursor ordering */
	ordering?: ValueTypes["cursor_ordering"] | undefined | null | Variable<any, string>
};
	/** Initial value of the column from where the streaming should start */
["customer_stream_cursor_value_input"]: {
	active?: number | undefined | null | Variable<any, string>,
	activebool?: boolean | undefined | null | Variable<any, string>,
	address_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	create_date?: ValueTypes["date"] | undefined | null | Variable<any, string>,
	customer_id?: number | undefined | null | Variable<any, string>,
	email?: string | undefined | null | Variable<any, string>,
	first_name?: string | undefined | null | Variable<any, string>,
	last_name?: string | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>,
	store_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>
};
	/** aggregate sum on columns */
["customer_sum_fields"]: AliasType<{
	active?:boolean | `@${string}`,
	address_id?:boolean | `@${string}`,
	customer_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** update columns of table "customer" */
["customer_update_column"]:customer_update_column;
	["customer_updates"]: {
	/** increments the numeric columns with given value of the filtered values */
	_inc?: ValueTypes["customer_inc_input"] | undefined | null | Variable<any, string>,
	/** sets the columns of the filtered rows to the given values */
	_set?: ValueTypes["customer_set_input"] | undefined | null | Variable<any, string>,
	/** filter the rows which have to be updated */
	where: ValueTypes["customer_bool_exp"] | Variable<any, string>
};
	/** aggregate var_pop on columns */
["customer_var_pop_fields"]: AliasType<{
	active?:boolean | `@${string}`,
	address_id?:boolean | `@${string}`,
	customer_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_samp on columns */
["customer_var_samp_fields"]: AliasType<{
	active?:boolean | `@${string}`,
	address_id?:boolean | `@${string}`,
	customer_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate variance on columns */
["customer_variance_fields"]: AliasType<{
	active?:boolean | `@${string}`,
	address_id?:boolean | `@${string}`,
	customer_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	["date"]:unknown;
	/** Boolean expression to compare columns of type "date". All fields are combined with logical 'AND'. */
["date_comparison_exp"]: {
	_eq?: ValueTypes["date"] | undefined | null | Variable<any, string>,
	_gt?: ValueTypes["date"] | undefined | null | Variable<any, string>,
	_gte?: ValueTypes["date"] | undefined | null | Variable<any, string>,
	_in?: Array<ValueTypes["date"]> | undefined | null | Variable<any, string>,
	_is_null?: boolean | undefined | null | Variable<any, string>,
	_lt?: ValueTypes["date"] | undefined | null | Variable<any, string>,
	_lte?: ValueTypes["date"] | undefined | null | Variable<any, string>,
	_neq?: ValueTypes["date"] | undefined | null | Variable<any, string>,
	_nin?: Array<ValueTypes["date"]> | undefined | null | Variable<any, string>
};
	/** columns and relationships of "film" */
["film"]: AliasType<{
	description?:boolean | `@${string}`,
	film_id?:boolean | `@${string}`,
	fulltext?:boolean | `@${string}`,
	language_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	rating?:boolean | `@${string}`,
	release_year?:boolean | `@${string}`,
	rental_duration?:boolean | `@${string}`,
	rental_rate?:boolean | `@${string}`,
	replacement_cost?:boolean | `@${string}`,
	special_features?:boolean | `@${string}`,
	title?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** columns and relationships of "film_actor" */
["film_actor"]: AliasType<{
	actor_id?:boolean | `@${string}`,
	film_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregated selection of "film_actor" */
["film_actor_aggregate"]: AliasType<{
	aggregate?:ValueTypes["film_actor_aggregate_fields"],
	nodes?:ValueTypes["film_actor"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate fields of "film_actor" */
["film_actor_aggregate_fields"]: AliasType<{
	avg?:ValueTypes["film_actor_avg_fields"],
count?: [{	columns?: Array<ValueTypes["film_actor_select_column"]> | undefined | null | Variable<any, string>,	distinct?: boolean | undefined | null | Variable<any, string>},boolean | `@${string}`],
	max?:ValueTypes["film_actor_max_fields"],
	min?:ValueTypes["film_actor_min_fields"],
	stddev?:ValueTypes["film_actor_stddev_fields"],
	stddev_pop?:ValueTypes["film_actor_stddev_pop_fields"],
	stddev_samp?:ValueTypes["film_actor_stddev_samp_fields"],
	sum?:ValueTypes["film_actor_sum_fields"],
	var_pop?:ValueTypes["film_actor_var_pop_fields"],
	var_samp?:ValueTypes["film_actor_var_samp_fields"],
	variance?:ValueTypes["film_actor_variance_fields"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate avg on columns */
["film_actor_avg_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
	film_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Boolean expression to filter rows from the table "film_actor". All fields are combined with a logical 'AND'. */
["film_actor_bool_exp"]: {
	_and?: Array<ValueTypes["film_actor_bool_exp"]> | undefined | null | Variable<any, string>,
	_not?: ValueTypes["film_actor_bool_exp"] | undefined | null | Variable<any, string>,
	_or?: Array<ValueTypes["film_actor_bool_exp"]> | undefined | null | Variable<any, string>,
	actor_id?: ValueTypes["smallint_comparison_exp"] | undefined | null | Variable<any, string>,
	film_id?: ValueTypes["smallint_comparison_exp"] | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp_comparison_exp"] | undefined | null | Variable<any, string>
};
	/** unique or primary key constraints on table "film_actor" */
["film_actor_constraint"]:film_actor_constraint;
	/** input type for incrementing numeric columns in table "film_actor" */
["film_actor_inc_input"]: {
	actor_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	film_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>
};
	/** input type for inserting data into table "film_actor" */
["film_actor_insert_input"]: {
	actor_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	film_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>
};
	/** aggregate max on columns */
["film_actor_max_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
	film_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate min on columns */
["film_actor_min_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
	film_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** response of any mutation on the table "film_actor" */
["film_actor_mutation_response"]: AliasType<{
	/** number of rows affected by the mutation */
	affected_rows?:boolean | `@${string}`,
	/** data from the rows affected by the mutation */
	returning?:ValueTypes["film_actor"],
		__typename?: boolean | `@${string}`
}>;
	/** on_conflict condition type for table "film_actor" */
["film_actor_on_conflict"]: {
	constraint: ValueTypes["film_actor_constraint"] | Variable<any, string>,
	update_columns: Array<ValueTypes["film_actor_update_column"]> | Variable<any, string>,
	where?: ValueTypes["film_actor_bool_exp"] | undefined | null | Variable<any, string>
};
	/** Ordering options when selecting data from "film_actor". */
["film_actor_order_by"]: {
	actor_id?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	film_id?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["order_by"] | undefined | null | Variable<any, string>
};
	/** primary key columns input for table: film_actor */
["film_actor_pk_columns_input"]: {
	actor_id: ValueTypes["smallint"] | Variable<any, string>,
	film_id: ValueTypes["smallint"] | Variable<any, string>
};
	/** select columns of table "film_actor" */
["film_actor_select_column"]:film_actor_select_column;
	/** input type for updating data in table "film_actor" */
["film_actor_set_input"]: {
	actor_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	film_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>
};
	/** aggregate stddev on columns */
["film_actor_stddev_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
	film_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_pop on columns */
["film_actor_stddev_pop_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
	film_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_samp on columns */
["film_actor_stddev_samp_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
	film_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Streaming cursor of the table "film_actor" */
["film_actor_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ValueTypes["film_actor_stream_cursor_value_input"] | Variable<any, string>,
	/** cursor ordering */
	ordering?: ValueTypes["cursor_ordering"] | undefined | null | Variable<any, string>
};
	/** Initial value of the column from where the streaming should start */
["film_actor_stream_cursor_value_input"]: {
	actor_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	film_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>
};
	/** aggregate sum on columns */
["film_actor_sum_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
	film_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** update columns of table "film_actor" */
["film_actor_update_column"]:film_actor_update_column;
	["film_actor_updates"]: {
	/** increments the numeric columns with given value of the filtered values */
	_inc?: ValueTypes["film_actor_inc_input"] | undefined | null | Variable<any, string>,
	/** sets the columns of the filtered rows to the given values */
	_set?: ValueTypes["film_actor_set_input"] | undefined | null | Variable<any, string>,
	/** filter the rows which have to be updated */
	where: ValueTypes["film_actor_bool_exp"] | Variable<any, string>
};
	/** aggregate var_pop on columns */
["film_actor_var_pop_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
	film_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_samp on columns */
["film_actor_var_samp_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
	film_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate variance on columns */
["film_actor_variance_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
	film_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregated selection of "film" */
["film_aggregate"]: AliasType<{
	aggregate?:ValueTypes["film_aggregate_fields"],
	nodes?:ValueTypes["film"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate fields of "film" */
["film_aggregate_fields"]: AliasType<{
	avg?:ValueTypes["film_avg_fields"],
count?: [{	columns?: Array<ValueTypes["film_select_column"]> | undefined | null | Variable<any, string>,	distinct?: boolean | undefined | null | Variable<any, string>},boolean | `@${string}`],
	max?:ValueTypes["film_max_fields"],
	min?:ValueTypes["film_min_fields"],
	stddev?:ValueTypes["film_stddev_fields"],
	stddev_pop?:ValueTypes["film_stddev_pop_fields"],
	stddev_samp?:ValueTypes["film_stddev_samp_fields"],
	sum?:ValueTypes["film_sum_fields"],
	var_pop?:ValueTypes["film_var_pop_fields"],
	var_samp?:ValueTypes["film_var_samp_fields"],
	variance?:ValueTypes["film_variance_fields"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate avg on columns */
["film_avg_fields"]: AliasType<{
	film_id?:boolean | `@${string}`,
	language_id?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	release_year?:boolean | `@${string}`,
	rental_duration?:boolean | `@${string}`,
	rental_rate?:boolean | `@${string}`,
	replacement_cost?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Boolean expression to filter rows from the table "film". All fields are combined with a logical 'AND'. */
["film_bool_exp"]: {
	_and?: Array<ValueTypes["film_bool_exp"]> | undefined | null | Variable<any, string>,
	_not?: ValueTypes["film_bool_exp"] | undefined | null | Variable<any, string>,
	_or?: Array<ValueTypes["film_bool_exp"]> | undefined | null | Variable<any, string>,
	description?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
	film_id?: ValueTypes["Int_comparison_exp"] | undefined | null | Variable<any, string>,
	fulltext?: ValueTypes["tsvector_comparison_exp"] | undefined | null | Variable<any, string>,
	language_id?: ValueTypes["smallint_comparison_exp"] | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp_comparison_exp"] | undefined | null | Variable<any, string>,
	length?: ValueTypes["smallint_comparison_exp"] | undefined | null | Variable<any, string>,
	rating?: ValueTypes["mpaa_rating_comparison_exp"] | undefined | null | Variable<any, string>,
	release_year?: ValueTypes["Int_comparison_exp"] | undefined | null | Variable<any, string>,
	rental_duration?: ValueTypes["smallint_comparison_exp"] | undefined | null | Variable<any, string>,
	rental_rate?: ValueTypes["numeric_comparison_exp"] | undefined | null | Variable<any, string>,
	replacement_cost?: ValueTypes["numeric_comparison_exp"] | undefined | null | Variable<any, string>,
	special_features?: ValueTypes["_text_comparison_exp"] | undefined | null | Variable<any, string>,
	title?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>
};
	/** columns and relationships of "film_category" */
["film_category"]: AliasType<{
	category_id?:boolean | `@${string}`,
	film_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregated selection of "film_category" */
["film_category_aggregate"]: AliasType<{
	aggregate?:ValueTypes["film_category_aggregate_fields"],
	nodes?:ValueTypes["film_category"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate fields of "film_category" */
["film_category_aggregate_fields"]: AliasType<{
	avg?:ValueTypes["film_category_avg_fields"],
count?: [{	columns?: Array<ValueTypes["film_category_select_column"]> | undefined | null | Variable<any, string>,	distinct?: boolean | undefined | null | Variable<any, string>},boolean | `@${string}`],
	max?:ValueTypes["film_category_max_fields"],
	min?:ValueTypes["film_category_min_fields"],
	stddev?:ValueTypes["film_category_stddev_fields"],
	stddev_pop?:ValueTypes["film_category_stddev_pop_fields"],
	stddev_samp?:ValueTypes["film_category_stddev_samp_fields"],
	sum?:ValueTypes["film_category_sum_fields"],
	var_pop?:ValueTypes["film_category_var_pop_fields"],
	var_samp?:ValueTypes["film_category_var_samp_fields"],
	variance?:ValueTypes["film_category_variance_fields"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate avg on columns */
["film_category_avg_fields"]: AliasType<{
	category_id?:boolean | `@${string}`,
	film_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Boolean expression to filter rows from the table "film_category". All fields are combined with a logical 'AND'. */
["film_category_bool_exp"]: {
	_and?: Array<ValueTypes["film_category_bool_exp"]> | undefined | null | Variable<any, string>,
	_not?: ValueTypes["film_category_bool_exp"] | undefined | null | Variable<any, string>,
	_or?: Array<ValueTypes["film_category_bool_exp"]> | undefined | null | Variable<any, string>,
	category_id?: ValueTypes["smallint_comparison_exp"] | undefined | null | Variable<any, string>,
	film_id?: ValueTypes["smallint_comparison_exp"] | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp_comparison_exp"] | undefined | null | Variable<any, string>
};
	/** unique or primary key constraints on table "film_category" */
["film_category_constraint"]:film_category_constraint;
	/** input type for incrementing numeric columns in table "film_category" */
["film_category_inc_input"]: {
	category_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	film_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>
};
	/** input type for inserting data into table "film_category" */
["film_category_insert_input"]: {
	category_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	film_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>
};
	/** aggregate max on columns */
["film_category_max_fields"]: AliasType<{
	category_id?:boolean | `@${string}`,
	film_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate min on columns */
["film_category_min_fields"]: AliasType<{
	category_id?:boolean | `@${string}`,
	film_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** response of any mutation on the table "film_category" */
["film_category_mutation_response"]: AliasType<{
	/** number of rows affected by the mutation */
	affected_rows?:boolean | `@${string}`,
	/** data from the rows affected by the mutation */
	returning?:ValueTypes["film_category"],
		__typename?: boolean | `@${string}`
}>;
	/** on_conflict condition type for table "film_category" */
["film_category_on_conflict"]: {
	constraint: ValueTypes["film_category_constraint"] | Variable<any, string>,
	update_columns: Array<ValueTypes["film_category_update_column"]> | Variable<any, string>,
	where?: ValueTypes["film_category_bool_exp"] | undefined | null | Variable<any, string>
};
	/** Ordering options when selecting data from "film_category". */
["film_category_order_by"]: {
	category_id?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	film_id?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["order_by"] | undefined | null | Variable<any, string>
};
	/** primary key columns input for table: film_category */
["film_category_pk_columns_input"]: {
	category_id: ValueTypes["smallint"] | Variable<any, string>,
	film_id: ValueTypes["smallint"] | Variable<any, string>
};
	/** select columns of table "film_category" */
["film_category_select_column"]:film_category_select_column;
	/** input type for updating data in table "film_category" */
["film_category_set_input"]: {
	category_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	film_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>
};
	/** aggregate stddev on columns */
["film_category_stddev_fields"]: AliasType<{
	category_id?:boolean | `@${string}`,
	film_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_pop on columns */
["film_category_stddev_pop_fields"]: AliasType<{
	category_id?:boolean | `@${string}`,
	film_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_samp on columns */
["film_category_stddev_samp_fields"]: AliasType<{
	category_id?:boolean | `@${string}`,
	film_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Streaming cursor of the table "film_category" */
["film_category_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ValueTypes["film_category_stream_cursor_value_input"] | Variable<any, string>,
	/** cursor ordering */
	ordering?: ValueTypes["cursor_ordering"] | undefined | null | Variable<any, string>
};
	/** Initial value of the column from where the streaming should start */
["film_category_stream_cursor_value_input"]: {
	category_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	film_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>
};
	/** aggregate sum on columns */
["film_category_sum_fields"]: AliasType<{
	category_id?:boolean | `@${string}`,
	film_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** update columns of table "film_category" */
["film_category_update_column"]:film_category_update_column;
	["film_category_updates"]: {
	/** increments the numeric columns with given value of the filtered values */
	_inc?: ValueTypes["film_category_inc_input"] | undefined | null | Variable<any, string>,
	/** sets the columns of the filtered rows to the given values */
	_set?: ValueTypes["film_category_set_input"] | undefined | null | Variable<any, string>,
	/** filter the rows which have to be updated */
	where: ValueTypes["film_category_bool_exp"] | Variable<any, string>
};
	/** aggregate var_pop on columns */
["film_category_var_pop_fields"]: AliasType<{
	category_id?:boolean | `@${string}`,
	film_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_samp on columns */
["film_category_var_samp_fields"]: AliasType<{
	category_id?:boolean | `@${string}`,
	film_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate variance on columns */
["film_category_variance_fields"]: AliasType<{
	category_id?:boolean | `@${string}`,
	film_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** unique or primary key constraints on table "film" */
["film_constraint"]:film_constraint;
	/** input type for incrementing numeric columns in table "film" */
["film_inc_input"]: {
	film_id?: number | undefined | null | Variable<any, string>,
	language_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	length?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	release_year?: number | undefined | null | Variable<any, string>,
	rental_duration?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	rental_rate?: ValueTypes["numeric"] | undefined | null | Variable<any, string>,
	replacement_cost?: ValueTypes["numeric"] | undefined | null | Variable<any, string>
};
	/** input type for inserting data into table "film" */
["film_insert_input"]: {
	description?: string | undefined | null | Variable<any, string>,
	film_id?: number | undefined | null | Variable<any, string>,
	fulltext?: ValueTypes["tsvector"] | undefined | null | Variable<any, string>,
	language_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>,
	length?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	rating?: ValueTypes["mpaa_rating"] | undefined | null | Variable<any, string>,
	release_year?: number | undefined | null | Variable<any, string>,
	rental_duration?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	rental_rate?: ValueTypes["numeric"] | undefined | null | Variable<any, string>,
	replacement_cost?: ValueTypes["numeric"] | undefined | null | Variable<any, string>,
	special_features?: ValueTypes["_text"] | undefined | null | Variable<any, string>,
	title?: string | undefined | null | Variable<any, string>
};
	/** columns and relationships of "film_list" */
["film_list"]: AliasType<{
	actors?:boolean | `@${string}`,
	category?:boolean | `@${string}`,
	description?:boolean | `@${string}`,
	fid?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	price?:boolean | `@${string}`,
	rating?:boolean | `@${string}`,
	title?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregated selection of "film_list" */
["film_list_aggregate"]: AliasType<{
	aggregate?:ValueTypes["film_list_aggregate_fields"],
	nodes?:ValueTypes["film_list"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate fields of "film_list" */
["film_list_aggregate_fields"]: AliasType<{
	avg?:ValueTypes["film_list_avg_fields"],
count?: [{	columns?: Array<ValueTypes["film_list_select_column"]> | undefined | null | Variable<any, string>,	distinct?: boolean | undefined | null | Variable<any, string>},boolean | `@${string}`],
	max?:ValueTypes["film_list_max_fields"],
	min?:ValueTypes["film_list_min_fields"],
	stddev?:ValueTypes["film_list_stddev_fields"],
	stddev_pop?:ValueTypes["film_list_stddev_pop_fields"],
	stddev_samp?:ValueTypes["film_list_stddev_samp_fields"],
	sum?:ValueTypes["film_list_sum_fields"],
	var_pop?:ValueTypes["film_list_var_pop_fields"],
	var_samp?:ValueTypes["film_list_var_samp_fields"],
	variance?:ValueTypes["film_list_variance_fields"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate avg on columns */
["film_list_avg_fields"]: AliasType<{
	fid?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	price?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Boolean expression to filter rows from the table "film_list". All fields are combined with a logical 'AND'. */
["film_list_bool_exp"]: {
	_and?: Array<ValueTypes["film_list_bool_exp"]> | undefined | null | Variable<any, string>,
	_not?: ValueTypes["film_list_bool_exp"] | undefined | null | Variable<any, string>,
	_or?: Array<ValueTypes["film_list_bool_exp"]> | undefined | null | Variable<any, string>,
	actors?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
	category?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
	description?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
	fid?: ValueTypes["Int_comparison_exp"] | undefined | null | Variable<any, string>,
	length?: ValueTypes["smallint_comparison_exp"] | undefined | null | Variable<any, string>,
	price?: ValueTypes["numeric_comparison_exp"] | undefined | null | Variable<any, string>,
	rating?: ValueTypes["mpaa_rating_comparison_exp"] | undefined | null | Variable<any, string>,
	title?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>
};
	/** aggregate max on columns */
["film_list_max_fields"]: AliasType<{
	actors?:boolean | `@${string}`,
	category?:boolean | `@${string}`,
	description?:boolean | `@${string}`,
	fid?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	price?:boolean | `@${string}`,
	rating?:boolean | `@${string}`,
	title?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate min on columns */
["film_list_min_fields"]: AliasType<{
	actors?:boolean | `@${string}`,
	category?:boolean | `@${string}`,
	description?:boolean | `@${string}`,
	fid?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	price?:boolean | `@${string}`,
	rating?:boolean | `@${string}`,
	title?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Ordering options when selecting data from "film_list". */
["film_list_order_by"]: {
	actors?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	category?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	description?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	fid?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	length?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	price?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	rating?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	title?: ValueTypes["order_by"] | undefined | null | Variable<any, string>
};
	/** select columns of table "film_list" */
["film_list_select_column"]:film_list_select_column;
	/** aggregate stddev on columns */
["film_list_stddev_fields"]: AliasType<{
	fid?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	price?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_pop on columns */
["film_list_stddev_pop_fields"]: AliasType<{
	fid?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	price?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_samp on columns */
["film_list_stddev_samp_fields"]: AliasType<{
	fid?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	price?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Streaming cursor of the table "film_list" */
["film_list_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ValueTypes["film_list_stream_cursor_value_input"] | Variable<any, string>,
	/** cursor ordering */
	ordering?: ValueTypes["cursor_ordering"] | undefined | null | Variable<any, string>
};
	/** Initial value of the column from where the streaming should start */
["film_list_stream_cursor_value_input"]: {
	actors?: string | undefined | null | Variable<any, string>,
	category?: string | undefined | null | Variable<any, string>,
	description?: string | undefined | null | Variable<any, string>,
	fid?: number | undefined | null | Variable<any, string>,
	length?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	price?: ValueTypes["numeric"] | undefined | null | Variable<any, string>,
	rating?: ValueTypes["mpaa_rating"] | undefined | null | Variable<any, string>,
	title?: string | undefined | null | Variable<any, string>
};
	/** aggregate sum on columns */
["film_list_sum_fields"]: AliasType<{
	fid?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	price?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_pop on columns */
["film_list_var_pop_fields"]: AliasType<{
	fid?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	price?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_samp on columns */
["film_list_var_samp_fields"]: AliasType<{
	fid?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	price?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate variance on columns */
["film_list_variance_fields"]: AliasType<{
	fid?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	price?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate max on columns */
["film_max_fields"]: AliasType<{
	description?:boolean | `@${string}`,
	film_id?:boolean | `@${string}`,
	language_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	rating?:boolean | `@${string}`,
	release_year?:boolean | `@${string}`,
	rental_duration?:boolean | `@${string}`,
	rental_rate?:boolean | `@${string}`,
	replacement_cost?:boolean | `@${string}`,
	title?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate min on columns */
["film_min_fields"]: AliasType<{
	description?:boolean | `@${string}`,
	film_id?:boolean | `@${string}`,
	language_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	rating?:boolean | `@${string}`,
	release_year?:boolean | `@${string}`,
	rental_duration?:boolean | `@${string}`,
	rental_rate?:boolean | `@${string}`,
	replacement_cost?:boolean | `@${string}`,
	title?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** response of any mutation on the table "film" */
["film_mutation_response"]: AliasType<{
	/** number of rows affected by the mutation */
	affected_rows?:boolean | `@${string}`,
	/** data from the rows affected by the mutation */
	returning?:ValueTypes["film"],
		__typename?: boolean | `@${string}`
}>;
	/** on_conflict condition type for table "film" */
["film_on_conflict"]: {
	constraint: ValueTypes["film_constraint"] | Variable<any, string>,
	update_columns: Array<ValueTypes["film_update_column"]> | Variable<any, string>,
	where?: ValueTypes["film_bool_exp"] | undefined | null | Variable<any, string>
};
	/** Ordering options when selecting data from "film". */
["film_order_by"]: {
	description?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	film_id?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	fulltext?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	language_id?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	length?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	rating?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	release_year?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	rental_duration?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	rental_rate?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	replacement_cost?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	special_features?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	title?: ValueTypes["order_by"] | undefined | null | Variable<any, string>
};
	/** primary key columns input for table: film */
["film_pk_columns_input"]: {
	film_id: number | Variable<any, string>
};
	/** select columns of table "film" */
["film_select_column"]:film_select_column;
	/** input type for updating data in table "film" */
["film_set_input"]: {
	description?: string | undefined | null | Variable<any, string>,
	film_id?: number | undefined | null | Variable<any, string>,
	fulltext?: ValueTypes["tsvector"] | undefined | null | Variable<any, string>,
	language_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>,
	length?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	rating?: ValueTypes["mpaa_rating"] | undefined | null | Variable<any, string>,
	release_year?: number | undefined | null | Variable<any, string>,
	rental_duration?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	rental_rate?: ValueTypes["numeric"] | undefined | null | Variable<any, string>,
	replacement_cost?: ValueTypes["numeric"] | undefined | null | Variable<any, string>,
	special_features?: ValueTypes["_text"] | undefined | null | Variable<any, string>,
	title?: string | undefined | null | Variable<any, string>
};
	/** aggregate stddev on columns */
["film_stddev_fields"]: AliasType<{
	film_id?:boolean | `@${string}`,
	language_id?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	release_year?:boolean | `@${string}`,
	rental_duration?:boolean | `@${string}`,
	rental_rate?:boolean | `@${string}`,
	replacement_cost?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_pop on columns */
["film_stddev_pop_fields"]: AliasType<{
	film_id?:boolean | `@${string}`,
	language_id?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	release_year?:boolean | `@${string}`,
	rental_duration?:boolean | `@${string}`,
	rental_rate?:boolean | `@${string}`,
	replacement_cost?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_samp on columns */
["film_stddev_samp_fields"]: AliasType<{
	film_id?:boolean | `@${string}`,
	language_id?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	release_year?:boolean | `@${string}`,
	rental_duration?:boolean | `@${string}`,
	rental_rate?:boolean | `@${string}`,
	replacement_cost?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Streaming cursor of the table "film" */
["film_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ValueTypes["film_stream_cursor_value_input"] | Variable<any, string>,
	/** cursor ordering */
	ordering?: ValueTypes["cursor_ordering"] | undefined | null | Variable<any, string>
};
	/** Initial value of the column from where the streaming should start */
["film_stream_cursor_value_input"]: {
	description?: string | undefined | null | Variable<any, string>,
	film_id?: number | undefined | null | Variable<any, string>,
	fulltext?: ValueTypes["tsvector"] | undefined | null | Variable<any, string>,
	language_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>,
	length?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	rating?: ValueTypes["mpaa_rating"] | undefined | null | Variable<any, string>,
	release_year?: number | undefined | null | Variable<any, string>,
	rental_duration?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	rental_rate?: ValueTypes["numeric"] | undefined | null | Variable<any, string>,
	replacement_cost?: ValueTypes["numeric"] | undefined | null | Variable<any, string>,
	special_features?: ValueTypes["_text"] | undefined | null | Variable<any, string>,
	title?: string | undefined | null | Variable<any, string>
};
	/** aggregate sum on columns */
["film_sum_fields"]: AliasType<{
	film_id?:boolean | `@${string}`,
	language_id?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	release_year?:boolean | `@${string}`,
	rental_duration?:boolean | `@${string}`,
	rental_rate?:boolean | `@${string}`,
	replacement_cost?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** update columns of table "film" */
["film_update_column"]:film_update_column;
	["film_updates"]: {
	/** increments the numeric columns with given value of the filtered values */
	_inc?: ValueTypes["film_inc_input"] | undefined | null | Variable<any, string>,
	/** sets the columns of the filtered rows to the given values */
	_set?: ValueTypes["film_set_input"] | undefined | null | Variable<any, string>,
	/** filter the rows which have to be updated */
	where: ValueTypes["film_bool_exp"] | Variable<any, string>
};
	/** aggregate var_pop on columns */
["film_var_pop_fields"]: AliasType<{
	film_id?:boolean | `@${string}`,
	language_id?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	release_year?:boolean | `@${string}`,
	rental_duration?:boolean | `@${string}`,
	rental_rate?:boolean | `@${string}`,
	replacement_cost?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_samp on columns */
["film_var_samp_fields"]: AliasType<{
	film_id?:boolean | `@${string}`,
	language_id?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	release_year?:boolean | `@${string}`,
	rental_duration?:boolean | `@${string}`,
	rental_rate?:boolean | `@${string}`,
	replacement_cost?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate variance on columns */
["film_variance_fields"]: AliasType<{
	film_id?:boolean | `@${string}`,
	language_id?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	release_year?:boolean | `@${string}`,
	rental_duration?:boolean | `@${string}`,
	rental_rate?:boolean | `@${string}`,
	replacement_cost?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** columns and relationships of "inventory" */
["inventory"]: AliasType<{
	film_id?:boolean | `@${string}`,
	inventory_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregated selection of "inventory" */
["inventory_aggregate"]: AliasType<{
	aggregate?:ValueTypes["inventory_aggregate_fields"],
	nodes?:ValueTypes["inventory"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate fields of "inventory" */
["inventory_aggregate_fields"]: AliasType<{
	avg?:ValueTypes["inventory_avg_fields"],
count?: [{	columns?: Array<ValueTypes["inventory_select_column"]> | undefined | null | Variable<any, string>,	distinct?: boolean | undefined | null | Variable<any, string>},boolean | `@${string}`],
	max?:ValueTypes["inventory_max_fields"],
	min?:ValueTypes["inventory_min_fields"],
	stddev?:ValueTypes["inventory_stddev_fields"],
	stddev_pop?:ValueTypes["inventory_stddev_pop_fields"],
	stddev_samp?:ValueTypes["inventory_stddev_samp_fields"],
	sum?:ValueTypes["inventory_sum_fields"],
	var_pop?:ValueTypes["inventory_var_pop_fields"],
	var_samp?:ValueTypes["inventory_var_samp_fields"],
	variance?:ValueTypes["inventory_variance_fields"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate avg on columns */
["inventory_avg_fields"]: AliasType<{
	film_id?:boolean | `@${string}`,
	inventory_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Boolean expression to filter rows from the table "inventory". All fields are combined with a logical 'AND'. */
["inventory_bool_exp"]: {
	_and?: Array<ValueTypes["inventory_bool_exp"]> | undefined | null | Variable<any, string>,
	_not?: ValueTypes["inventory_bool_exp"] | undefined | null | Variable<any, string>,
	_or?: Array<ValueTypes["inventory_bool_exp"]> | undefined | null | Variable<any, string>,
	film_id?: ValueTypes["smallint_comparison_exp"] | undefined | null | Variable<any, string>,
	inventory_id?: ValueTypes["Int_comparison_exp"] | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp_comparison_exp"] | undefined | null | Variable<any, string>,
	store_id?: ValueTypes["smallint_comparison_exp"] | undefined | null | Variable<any, string>
};
	/** unique or primary key constraints on table "inventory" */
["inventory_constraint"]:inventory_constraint;
	/** input type for incrementing numeric columns in table "inventory" */
["inventory_inc_input"]: {
	film_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	inventory_id?: number | undefined | null | Variable<any, string>,
	store_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>
};
	/** input type for inserting data into table "inventory" */
["inventory_insert_input"]: {
	film_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	inventory_id?: number | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>,
	store_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>
};
	/** aggregate max on columns */
["inventory_max_fields"]: AliasType<{
	film_id?:boolean | `@${string}`,
	inventory_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate min on columns */
["inventory_min_fields"]: AliasType<{
	film_id?:boolean | `@${string}`,
	inventory_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** response of any mutation on the table "inventory" */
["inventory_mutation_response"]: AliasType<{
	/** number of rows affected by the mutation */
	affected_rows?:boolean | `@${string}`,
	/** data from the rows affected by the mutation */
	returning?:ValueTypes["inventory"],
		__typename?: boolean | `@${string}`
}>;
	/** on_conflict condition type for table "inventory" */
["inventory_on_conflict"]: {
	constraint: ValueTypes["inventory_constraint"] | Variable<any, string>,
	update_columns: Array<ValueTypes["inventory_update_column"]> | Variable<any, string>,
	where?: ValueTypes["inventory_bool_exp"] | undefined | null | Variable<any, string>
};
	/** Ordering options when selecting data from "inventory". */
["inventory_order_by"]: {
	film_id?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	inventory_id?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	store_id?: ValueTypes["order_by"] | undefined | null | Variable<any, string>
};
	/** primary key columns input for table: inventory */
["inventory_pk_columns_input"]: {
	inventory_id: number | Variable<any, string>
};
	/** select columns of table "inventory" */
["inventory_select_column"]:inventory_select_column;
	/** input type for updating data in table "inventory" */
["inventory_set_input"]: {
	film_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	inventory_id?: number | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>,
	store_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>
};
	/** aggregate stddev on columns */
["inventory_stddev_fields"]: AliasType<{
	film_id?:boolean | `@${string}`,
	inventory_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_pop on columns */
["inventory_stddev_pop_fields"]: AliasType<{
	film_id?:boolean | `@${string}`,
	inventory_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_samp on columns */
["inventory_stddev_samp_fields"]: AliasType<{
	film_id?:boolean | `@${string}`,
	inventory_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Streaming cursor of the table "inventory" */
["inventory_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ValueTypes["inventory_stream_cursor_value_input"] | Variable<any, string>,
	/** cursor ordering */
	ordering?: ValueTypes["cursor_ordering"] | undefined | null | Variable<any, string>
};
	/** Initial value of the column from where the streaming should start */
["inventory_stream_cursor_value_input"]: {
	film_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	inventory_id?: number | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>,
	store_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>
};
	/** aggregate sum on columns */
["inventory_sum_fields"]: AliasType<{
	film_id?:boolean | `@${string}`,
	inventory_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** update columns of table "inventory" */
["inventory_update_column"]:inventory_update_column;
	["inventory_updates"]: {
	/** increments the numeric columns with given value of the filtered values */
	_inc?: ValueTypes["inventory_inc_input"] | undefined | null | Variable<any, string>,
	/** sets the columns of the filtered rows to the given values */
	_set?: ValueTypes["inventory_set_input"] | undefined | null | Variable<any, string>,
	/** filter the rows which have to be updated */
	where: ValueTypes["inventory_bool_exp"] | Variable<any, string>
};
	/** aggregate var_pop on columns */
["inventory_var_pop_fields"]: AliasType<{
	film_id?:boolean | `@${string}`,
	inventory_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_samp on columns */
["inventory_var_samp_fields"]: AliasType<{
	film_id?:boolean | `@${string}`,
	inventory_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate variance on columns */
["inventory_variance_fields"]: AliasType<{
	film_id?:boolean | `@${string}`,
	inventory_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** columns and relationships of "language" */
["language"]: AliasType<{
	language_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
	name?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregated selection of "language" */
["language_aggregate"]: AliasType<{
	aggregate?:ValueTypes["language_aggregate_fields"],
	nodes?:ValueTypes["language"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate fields of "language" */
["language_aggregate_fields"]: AliasType<{
	avg?:ValueTypes["language_avg_fields"],
count?: [{	columns?: Array<ValueTypes["language_select_column"]> | undefined | null | Variable<any, string>,	distinct?: boolean | undefined | null | Variable<any, string>},boolean | `@${string}`],
	max?:ValueTypes["language_max_fields"],
	min?:ValueTypes["language_min_fields"],
	stddev?:ValueTypes["language_stddev_fields"],
	stddev_pop?:ValueTypes["language_stddev_pop_fields"],
	stddev_samp?:ValueTypes["language_stddev_samp_fields"],
	sum?:ValueTypes["language_sum_fields"],
	var_pop?:ValueTypes["language_var_pop_fields"],
	var_samp?:ValueTypes["language_var_samp_fields"],
	variance?:ValueTypes["language_variance_fields"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate avg on columns */
["language_avg_fields"]: AliasType<{
	language_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Boolean expression to filter rows from the table "language". All fields are combined with a logical 'AND'. */
["language_bool_exp"]: {
	_and?: Array<ValueTypes["language_bool_exp"]> | undefined | null | Variable<any, string>,
	_not?: ValueTypes["language_bool_exp"] | undefined | null | Variable<any, string>,
	_or?: Array<ValueTypes["language_bool_exp"]> | undefined | null | Variable<any, string>,
	language_id?: ValueTypes["Int_comparison_exp"] | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp_comparison_exp"] | undefined | null | Variable<any, string>,
	name?: ValueTypes["bpchar_comparison_exp"] | undefined | null | Variable<any, string>
};
	/** unique or primary key constraints on table "language" */
["language_constraint"]:language_constraint;
	/** input type for incrementing numeric columns in table "language" */
["language_inc_input"]: {
	language_id?: number | undefined | null | Variable<any, string>
};
	/** input type for inserting data into table "language" */
["language_insert_input"]: {
	language_id?: number | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>,
	name?: ValueTypes["bpchar"] | undefined | null | Variable<any, string>
};
	/** aggregate max on columns */
["language_max_fields"]: AliasType<{
	language_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
	name?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate min on columns */
["language_min_fields"]: AliasType<{
	language_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
	name?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** response of any mutation on the table "language" */
["language_mutation_response"]: AliasType<{
	/** number of rows affected by the mutation */
	affected_rows?:boolean | `@${string}`,
	/** data from the rows affected by the mutation */
	returning?:ValueTypes["language"],
		__typename?: boolean | `@${string}`
}>;
	/** on_conflict condition type for table "language" */
["language_on_conflict"]: {
	constraint: ValueTypes["language_constraint"] | Variable<any, string>,
	update_columns: Array<ValueTypes["language_update_column"]> | Variable<any, string>,
	where?: ValueTypes["language_bool_exp"] | undefined | null | Variable<any, string>
};
	/** Ordering options when selecting data from "language". */
["language_order_by"]: {
	language_id?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	name?: ValueTypes["order_by"] | undefined | null | Variable<any, string>
};
	/** primary key columns input for table: language */
["language_pk_columns_input"]: {
	language_id: number | Variable<any, string>
};
	/** select columns of table "language" */
["language_select_column"]:language_select_column;
	/** input type for updating data in table "language" */
["language_set_input"]: {
	language_id?: number | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>,
	name?: ValueTypes["bpchar"] | undefined | null | Variable<any, string>
};
	/** aggregate stddev on columns */
["language_stddev_fields"]: AliasType<{
	language_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_pop on columns */
["language_stddev_pop_fields"]: AliasType<{
	language_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_samp on columns */
["language_stddev_samp_fields"]: AliasType<{
	language_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Streaming cursor of the table "language" */
["language_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ValueTypes["language_stream_cursor_value_input"] | Variable<any, string>,
	/** cursor ordering */
	ordering?: ValueTypes["cursor_ordering"] | undefined | null | Variable<any, string>
};
	/** Initial value of the column from where the streaming should start */
["language_stream_cursor_value_input"]: {
	language_id?: number | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>,
	name?: ValueTypes["bpchar"] | undefined | null | Variable<any, string>
};
	/** aggregate sum on columns */
["language_sum_fields"]: AliasType<{
	language_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** update columns of table "language" */
["language_update_column"]:language_update_column;
	["language_updates"]: {
	/** increments the numeric columns with given value of the filtered values */
	_inc?: ValueTypes["language_inc_input"] | undefined | null | Variable<any, string>,
	/** sets the columns of the filtered rows to the given values */
	_set?: ValueTypes["language_set_input"] | undefined | null | Variable<any, string>,
	/** filter the rows which have to be updated */
	where: ValueTypes["language_bool_exp"] | Variable<any, string>
};
	/** aggregate var_pop on columns */
["language_var_pop_fields"]: AliasType<{
	language_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_samp on columns */
["language_var_samp_fields"]: AliasType<{
	language_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate variance on columns */
["language_variance_fields"]: AliasType<{
	language_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	["mpaa_rating"]:unknown;
	/** Boolean expression to compare columns of type "mpaa_rating". All fields are combined with logical 'AND'. */
["mpaa_rating_comparison_exp"]: {
	_eq?: ValueTypes["mpaa_rating"] | undefined | null | Variable<any, string>,
	_gt?: ValueTypes["mpaa_rating"] | undefined | null | Variable<any, string>,
	_gte?: ValueTypes["mpaa_rating"] | undefined | null | Variable<any, string>,
	_in?: Array<ValueTypes["mpaa_rating"]> | undefined | null | Variable<any, string>,
	_is_null?: boolean | undefined | null | Variable<any, string>,
	_lt?: ValueTypes["mpaa_rating"] | undefined | null | Variable<any, string>,
	_lte?: ValueTypes["mpaa_rating"] | undefined | null | Variable<any, string>,
	_neq?: ValueTypes["mpaa_rating"] | undefined | null | Variable<any, string>,
	_nin?: Array<ValueTypes["mpaa_rating"]> | undefined | null | Variable<any, string>
};
	/** mutation root */
["mutation_root"]: AliasType<{
delete_actor?: [{	/** filter the rows which have to be deleted */
	where: ValueTypes["actor_bool_exp"] | Variable<any, string>},ValueTypes["actor_mutation_response"]],
delete_actor_by_pk?: [{	actor_id: number | Variable<any, string>},ValueTypes["actor"]],
delete_address?: [{	/** filter the rows which have to be deleted */
	where: ValueTypes["address_bool_exp"] | Variable<any, string>},ValueTypes["address_mutation_response"]],
delete_address_by_pk?: [{	address_id: number | Variable<any, string>},ValueTypes["address"]],
delete_category?: [{	/** filter the rows which have to be deleted */
	where: ValueTypes["category_bool_exp"] | Variable<any, string>},ValueTypes["category_mutation_response"]],
delete_category_by_pk?: [{	category_id: number | Variable<any, string>},ValueTypes["category"]],
delete_city?: [{	/** filter the rows which have to be deleted */
	where: ValueTypes["city_bool_exp"] | Variable<any, string>},ValueTypes["city_mutation_response"]],
delete_city_by_pk?: [{	city_id: number | Variable<any, string>},ValueTypes["city"]],
delete_country?: [{	/** filter the rows which have to be deleted */
	where: ValueTypes["country_bool_exp"] | Variable<any, string>},ValueTypes["country_mutation_response"]],
delete_country_by_pk?: [{	country_id: number | Variable<any, string>},ValueTypes["country"]],
delete_customer?: [{	/** filter the rows which have to be deleted */
	where: ValueTypes["customer_bool_exp"] | Variable<any, string>},ValueTypes["customer_mutation_response"]],
delete_customer_by_pk?: [{	customer_id: number | Variable<any, string>},ValueTypes["customer"]],
delete_film?: [{	/** filter the rows which have to be deleted */
	where: ValueTypes["film_bool_exp"] | Variable<any, string>},ValueTypes["film_mutation_response"]],
delete_film_actor?: [{	/** filter the rows which have to be deleted */
	where: ValueTypes["film_actor_bool_exp"] | Variable<any, string>},ValueTypes["film_actor_mutation_response"]],
delete_film_actor_by_pk?: [{	actor_id: ValueTypes["smallint"] | Variable<any, string>,	film_id: ValueTypes["smallint"] | Variable<any, string>},ValueTypes["film_actor"]],
delete_film_by_pk?: [{	film_id: number | Variable<any, string>},ValueTypes["film"]],
delete_film_category?: [{	/** filter the rows which have to be deleted */
	where: ValueTypes["film_category_bool_exp"] | Variable<any, string>},ValueTypes["film_category_mutation_response"]],
delete_film_category_by_pk?: [{	category_id: ValueTypes["smallint"] | Variable<any, string>,	film_id: ValueTypes["smallint"] | Variable<any, string>},ValueTypes["film_category"]],
delete_inventory?: [{	/** filter the rows which have to be deleted */
	where: ValueTypes["inventory_bool_exp"] | Variable<any, string>},ValueTypes["inventory_mutation_response"]],
delete_inventory_by_pk?: [{	inventory_id: number | Variable<any, string>},ValueTypes["inventory"]],
delete_language?: [{	/** filter the rows which have to be deleted */
	where: ValueTypes["language_bool_exp"] | Variable<any, string>},ValueTypes["language_mutation_response"]],
delete_language_by_pk?: [{	language_id: number | Variable<any, string>},ValueTypes["language"]],
delete_payment?: [{	/** filter the rows which have to be deleted */
	where: ValueTypes["payment_bool_exp"] | Variable<any, string>},ValueTypes["payment_mutation_response"]],
delete_payment_by_pk?: [{	payment_id: number | Variable<any, string>},ValueTypes["payment"]],
delete_rental?: [{	/** filter the rows which have to be deleted */
	where: ValueTypes["rental_bool_exp"] | Variable<any, string>},ValueTypes["rental_mutation_response"]],
delete_rental_by_pk?: [{	rental_id: number | Variable<any, string>},ValueTypes["rental"]],
delete_staff?: [{	/** filter the rows which have to be deleted */
	where: ValueTypes["staff_bool_exp"] | Variable<any, string>},ValueTypes["staff_mutation_response"]],
delete_staff_by_pk?: [{	staff_id: number | Variable<any, string>},ValueTypes["staff"]],
delete_store?: [{	/** filter the rows which have to be deleted */
	where: ValueTypes["store_bool_exp"] | Variable<any, string>},ValueTypes["store_mutation_response"]],
delete_store_by_pk?: [{	store_id: number | Variable<any, string>},ValueTypes["store"]],
insert_actor?: [{	/** the rows to be inserted */
	objects: Array<ValueTypes["actor_insert_input"]> | Variable<any, string>,	/** upsert condition */
	on_conflict?: ValueTypes["actor_on_conflict"] | undefined | null | Variable<any, string>},ValueTypes["actor_mutation_response"]],
insert_actor_one?: [{	/** the row to be inserted */
	object: ValueTypes["actor_insert_input"] | Variable<any, string>,	/** upsert condition */
	on_conflict?: ValueTypes["actor_on_conflict"] | undefined | null | Variable<any, string>},ValueTypes["actor"]],
insert_address?: [{	/** the rows to be inserted */
	objects: Array<ValueTypes["address_insert_input"]> | Variable<any, string>,	/** upsert condition */
	on_conflict?: ValueTypes["address_on_conflict"] | undefined | null | Variable<any, string>},ValueTypes["address_mutation_response"]],
insert_address_one?: [{	/** the row to be inserted */
	object: ValueTypes["address_insert_input"] | Variable<any, string>,	/** upsert condition */
	on_conflict?: ValueTypes["address_on_conflict"] | undefined | null | Variable<any, string>},ValueTypes["address"]],
insert_category?: [{	/** the rows to be inserted */
	objects: Array<ValueTypes["category_insert_input"]> | Variable<any, string>,	/** upsert condition */
	on_conflict?: ValueTypes["category_on_conflict"] | undefined | null | Variable<any, string>},ValueTypes["category_mutation_response"]],
insert_category_one?: [{	/** the row to be inserted */
	object: ValueTypes["category_insert_input"] | Variable<any, string>,	/** upsert condition */
	on_conflict?: ValueTypes["category_on_conflict"] | undefined | null | Variable<any, string>},ValueTypes["category"]],
insert_city?: [{	/** the rows to be inserted */
	objects: Array<ValueTypes["city_insert_input"]> | Variable<any, string>,	/** upsert condition */
	on_conflict?: ValueTypes["city_on_conflict"] | undefined | null | Variable<any, string>},ValueTypes["city_mutation_response"]],
insert_city_one?: [{	/** the row to be inserted */
	object: ValueTypes["city_insert_input"] | Variable<any, string>,	/** upsert condition */
	on_conflict?: ValueTypes["city_on_conflict"] | undefined | null | Variable<any, string>},ValueTypes["city"]],
insert_country?: [{	/** the rows to be inserted */
	objects: Array<ValueTypes["country_insert_input"]> | Variable<any, string>,	/** upsert condition */
	on_conflict?: ValueTypes["country_on_conflict"] | undefined | null | Variable<any, string>},ValueTypes["country_mutation_response"]],
insert_country_one?: [{	/** the row to be inserted */
	object: ValueTypes["country_insert_input"] | Variable<any, string>,	/** upsert condition */
	on_conflict?: ValueTypes["country_on_conflict"] | undefined | null | Variable<any, string>},ValueTypes["country"]],
insert_customer?: [{	/** the rows to be inserted */
	objects: Array<ValueTypes["customer_insert_input"]> | Variable<any, string>,	/** upsert condition */
	on_conflict?: ValueTypes["customer_on_conflict"] | undefined | null | Variable<any, string>},ValueTypes["customer_mutation_response"]],
insert_customer_one?: [{	/** the row to be inserted */
	object: ValueTypes["customer_insert_input"] | Variable<any, string>,	/** upsert condition */
	on_conflict?: ValueTypes["customer_on_conflict"] | undefined | null | Variable<any, string>},ValueTypes["customer"]],
insert_film?: [{	/** the rows to be inserted */
	objects: Array<ValueTypes["film_insert_input"]> | Variable<any, string>,	/** upsert condition */
	on_conflict?: ValueTypes["film_on_conflict"] | undefined | null | Variable<any, string>},ValueTypes["film_mutation_response"]],
insert_film_actor?: [{	/** the rows to be inserted */
	objects: Array<ValueTypes["film_actor_insert_input"]> | Variable<any, string>,	/** upsert condition */
	on_conflict?: ValueTypes["film_actor_on_conflict"] | undefined | null | Variable<any, string>},ValueTypes["film_actor_mutation_response"]],
insert_film_actor_one?: [{	/** the row to be inserted */
	object: ValueTypes["film_actor_insert_input"] | Variable<any, string>,	/** upsert condition */
	on_conflict?: ValueTypes["film_actor_on_conflict"] | undefined | null | Variable<any, string>},ValueTypes["film_actor"]],
insert_film_category?: [{	/** the rows to be inserted */
	objects: Array<ValueTypes["film_category_insert_input"]> | Variable<any, string>,	/** upsert condition */
	on_conflict?: ValueTypes["film_category_on_conflict"] | undefined | null | Variable<any, string>},ValueTypes["film_category_mutation_response"]],
insert_film_category_one?: [{	/** the row to be inserted */
	object: ValueTypes["film_category_insert_input"] | Variable<any, string>,	/** upsert condition */
	on_conflict?: ValueTypes["film_category_on_conflict"] | undefined | null | Variable<any, string>},ValueTypes["film_category"]],
insert_film_one?: [{	/** the row to be inserted */
	object: ValueTypes["film_insert_input"] | Variable<any, string>,	/** upsert condition */
	on_conflict?: ValueTypes["film_on_conflict"] | undefined | null | Variable<any, string>},ValueTypes["film"]],
insert_inventory?: [{	/** the rows to be inserted */
	objects: Array<ValueTypes["inventory_insert_input"]> | Variable<any, string>,	/** upsert condition */
	on_conflict?: ValueTypes["inventory_on_conflict"] | undefined | null | Variable<any, string>},ValueTypes["inventory_mutation_response"]],
insert_inventory_one?: [{	/** the row to be inserted */
	object: ValueTypes["inventory_insert_input"] | Variable<any, string>,	/** upsert condition */
	on_conflict?: ValueTypes["inventory_on_conflict"] | undefined | null | Variable<any, string>},ValueTypes["inventory"]],
insert_language?: [{	/** the rows to be inserted */
	objects: Array<ValueTypes["language_insert_input"]> | Variable<any, string>,	/** upsert condition */
	on_conflict?: ValueTypes["language_on_conflict"] | undefined | null | Variable<any, string>},ValueTypes["language_mutation_response"]],
insert_language_one?: [{	/** the row to be inserted */
	object: ValueTypes["language_insert_input"] | Variable<any, string>,	/** upsert condition */
	on_conflict?: ValueTypes["language_on_conflict"] | undefined | null | Variable<any, string>},ValueTypes["language"]],
insert_payment?: [{	/** the rows to be inserted */
	objects: Array<ValueTypes["payment_insert_input"]> | Variable<any, string>,	/** upsert condition */
	on_conflict?: ValueTypes["payment_on_conflict"] | undefined | null | Variable<any, string>},ValueTypes["payment_mutation_response"]],
insert_payment_one?: [{	/** the row to be inserted */
	object: ValueTypes["payment_insert_input"] | Variable<any, string>,	/** upsert condition */
	on_conflict?: ValueTypes["payment_on_conflict"] | undefined | null | Variable<any, string>},ValueTypes["payment"]],
insert_rental?: [{	/** the rows to be inserted */
	objects: Array<ValueTypes["rental_insert_input"]> | Variable<any, string>,	/** upsert condition */
	on_conflict?: ValueTypes["rental_on_conflict"] | undefined | null | Variable<any, string>},ValueTypes["rental_mutation_response"]],
insert_rental_one?: [{	/** the row to be inserted */
	object: ValueTypes["rental_insert_input"] | Variable<any, string>,	/** upsert condition */
	on_conflict?: ValueTypes["rental_on_conflict"] | undefined | null | Variable<any, string>},ValueTypes["rental"]],
insert_staff?: [{	/** the rows to be inserted */
	objects: Array<ValueTypes["staff_insert_input"]> | Variable<any, string>,	/** upsert condition */
	on_conflict?: ValueTypes["staff_on_conflict"] | undefined | null | Variable<any, string>},ValueTypes["staff_mutation_response"]],
insert_staff_one?: [{	/** the row to be inserted */
	object: ValueTypes["staff_insert_input"] | Variable<any, string>,	/** upsert condition */
	on_conflict?: ValueTypes["staff_on_conflict"] | undefined | null | Variable<any, string>},ValueTypes["staff"]],
insert_store?: [{	/** the rows to be inserted */
	objects: Array<ValueTypes["store_insert_input"]> | Variable<any, string>,	/** upsert condition */
	on_conflict?: ValueTypes["store_on_conflict"] | undefined | null | Variable<any, string>},ValueTypes["store_mutation_response"]],
insert_store_one?: [{	/** the row to be inserted */
	object: ValueTypes["store_insert_input"] | Variable<any, string>,	/** upsert condition */
	on_conflict?: ValueTypes["store_on_conflict"] | undefined | null | Variable<any, string>},ValueTypes["store"]],
update_actor?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ValueTypes["actor_inc_input"] | undefined | null | Variable<any, string>,	/** sets the columns of the filtered rows to the given values */
	_set?: ValueTypes["actor_set_input"] | undefined | null | Variable<any, string>,	/** filter the rows which have to be updated */
	where: ValueTypes["actor_bool_exp"] | Variable<any, string>},ValueTypes["actor_mutation_response"]],
update_actor_by_pk?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ValueTypes["actor_inc_input"] | undefined | null | Variable<any, string>,	/** sets the columns of the filtered rows to the given values */
	_set?: ValueTypes["actor_set_input"] | undefined | null | Variable<any, string>,	pk_columns: ValueTypes["actor_pk_columns_input"] | Variable<any, string>},ValueTypes["actor"]],
update_actor_many?: [{	/** updates to execute, in order */
	updates: Array<ValueTypes["actor_updates"]> | Variable<any, string>},ValueTypes["actor_mutation_response"]],
update_address?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ValueTypes["address_inc_input"] | undefined | null | Variable<any, string>,	/** sets the columns of the filtered rows to the given values */
	_set?: ValueTypes["address_set_input"] | undefined | null | Variable<any, string>,	/** filter the rows which have to be updated */
	where: ValueTypes["address_bool_exp"] | Variable<any, string>},ValueTypes["address_mutation_response"]],
update_address_by_pk?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ValueTypes["address_inc_input"] | undefined | null | Variable<any, string>,	/** sets the columns of the filtered rows to the given values */
	_set?: ValueTypes["address_set_input"] | undefined | null | Variable<any, string>,	pk_columns: ValueTypes["address_pk_columns_input"] | Variable<any, string>},ValueTypes["address"]],
update_address_many?: [{	/** updates to execute, in order */
	updates: Array<ValueTypes["address_updates"]> | Variable<any, string>},ValueTypes["address_mutation_response"]],
update_category?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ValueTypes["category_inc_input"] | undefined | null | Variable<any, string>,	/** sets the columns of the filtered rows to the given values */
	_set?: ValueTypes["category_set_input"] | undefined | null | Variable<any, string>,	/** filter the rows which have to be updated */
	where: ValueTypes["category_bool_exp"] | Variable<any, string>},ValueTypes["category_mutation_response"]],
update_category_by_pk?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ValueTypes["category_inc_input"] | undefined | null | Variable<any, string>,	/** sets the columns of the filtered rows to the given values */
	_set?: ValueTypes["category_set_input"] | undefined | null | Variable<any, string>,	pk_columns: ValueTypes["category_pk_columns_input"] | Variable<any, string>},ValueTypes["category"]],
update_category_many?: [{	/** updates to execute, in order */
	updates: Array<ValueTypes["category_updates"]> | Variable<any, string>},ValueTypes["category_mutation_response"]],
update_city?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ValueTypes["city_inc_input"] | undefined | null | Variable<any, string>,	/** sets the columns of the filtered rows to the given values */
	_set?: ValueTypes["city_set_input"] | undefined | null | Variable<any, string>,	/** filter the rows which have to be updated */
	where: ValueTypes["city_bool_exp"] | Variable<any, string>},ValueTypes["city_mutation_response"]],
update_city_by_pk?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ValueTypes["city_inc_input"] | undefined | null | Variable<any, string>,	/** sets the columns of the filtered rows to the given values */
	_set?: ValueTypes["city_set_input"] | undefined | null | Variable<any, string>,	pk_columns: ValueTypes["city_pk_columns_input"] | Variable<any, string>},ValueTypes["city"]],
update_city_many?: [{	/** updates to execute, in order */
	updates: Array<ValueTypes["city_updates"]> | Variable<any, string>},ValueTypes["city_mutation_response"]],
update_country?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ValueTypes["country_inc_input"] | undefined | null | Variable<any, string>,	/** sets the columns of the filtered rows to the given values */
	_set?: ValueTypes["country_set_input"] | undefined | null | Variable<any, string>,	/** filter the rows which have to be updated */
	where: ValueTypes["country_bool_exp"] | Variable<any, string>},ValueTypes["country_mutation_response"]],
update_country_by_pk?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ValueTypes["country_inc_input"] | undefined | null | Variable<any, string>,	/** sets the columns of the filtered rows to the given values */
	_set?: ValueTypes["country_set_input"] | undefined | null | Variable<any, string>,	pk_columns: ValueTypes["country_pk_columns_input"] | Variable<any, string>},ValueTypes["country"]],
update_country_many?: [{	/** updates to execute, in order */
	updates: Array<ValueTypes["country_updates"]> | Variable<any, string>},ValueTypes["country_mutation_response"]],
update_customer?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ValueTypes["customer_inc_input"] | undefined | null | Variable<any, string>,	/** sets the columns of the filtered rows to the given values */
	_set?: ValueTypes["customer_set_input"] | undefined | null | Variable<any, string>,	/** filter the rows which have to be updated */
	where: ValueTypes["customer_bool_exp"] | Variable<any, string>},ValueTypes["customer_mutation_response"]],
update_customer_by_pk?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ValueTypes["customer_inc_input"] | undefined | null | Variable<any, string>,	/** sets the columns of the filtered rows to the given values */
	_set?: ValueTypes["customer_set_input"] | undefined | null | Variable<any, string>,	pk_columns: ValueTypes["customer_pk_columns_input"] | Variable<any, string>},ValueTypes["customer"]],
update_customer_many?: [{	/** updates to execute, in order */
	updates: Array<ValueTypes["customer_updates"]> | Variable<any, string>},ValueTypes["customer_mutation_response"]],
update_film?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ValueTypes["film_inc_input"] | undefined | null | Variable<any, string>,	/** sets the columns of the filtered rows to the given values */
	_set?: ValueTypes["film_set_input"] | undefined | null | Variable<any, string>,	/** filter the rows which have to be updated */
	where: ValueTypes["film_bool_exp"] | Variable<any, string>},ValueTypes["film_mutation_response"]],
update_film_actor?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ValueTypes["film_actor_inc_input"] | undefined | null | Variable<any, string>,	/** sets the columns of the filtered rows to the given values */
	_set?: ValueTypes["film_actor_set_input"] | undefined | null | Variable<any, string>,	/** filter the rows which have to be updated */
	where: ValueTypes["film_actor_bool_exp"] | Variable<any, string>},ValueTypes["film_actor_mutation_response"]],
update_film_actor_by_pk?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ValueTypes["film_actor_inc_input"] | undefined | null | Variable<any, string>,	/** sets the columns of the filtered rows to the given values */
	_set?: ValueTypes["film_actor_set_input"] | undefined | null | Variable<any, string>,	pk_columns: ValueTypes["film_actor_pk_columns_input"] | Variable<any, string>},ValueTypes["film_actor"]],
update_film_actor_many?: [{	/** updates to execute, in order */
	updates: Array<ValueTypes["film_actor_updates"]> | Variable<any, string>},ValueTypes["film_actor_mutation_response"]],
update_film_by_pk?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ValueTypes["film_inc_input"] | undefined | null | Variable<any, string>,	/** sets the columns of the filtered rows to the given values */
	_set?: ValueTypes["film_set_input"] | undefined | null | Variable<any, string>,	pk_columns: ValueTypes["film_pk_columns_input"] | Variable<any, string>},ValueTypes["film"]],
update_film_category?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ValueTypes["film_category_inc_input"] | undefined | null | Variable<any, string>,	/** sets the columns of the filtered rows to the given values */
	_set?: ValueTypes["film_category_set_input"] | undefined | null | Variable<any, string>,	/** filter the rows which have to be updated */
	where: ValueTypes["film_category_bool_exp"] | Variable<any, string>},ValueTypes["film_category_mutation_response"]],
update_film_category_by_pk?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ValueTypes["film_category_inc_input"] | undefined | null | Variable<any, string>,	/** sets the columns of the filtered rows to the given values */
	_set?: ValueTypes["film_category_set_input"] | undefined | null | Variable<any, string>,	pk_columns: ValueTypes["film_category_pk_columns_input"] | Variable<any, string>},ValueTypes["film_category"]],
update_film_category_many?: [{	/** updates to execute, in order */
	updates: Array<ValueTypes["film_category_updates"]> | Variable<any, string>},ValueTypes["film_category_mutation_response"]],
update_film_many?: [{	/** updates to execute, in order */
	updates: Array<ValueTypes["film_updates"]> | Variable<any, string>},ValueTypes["film_mutation_response"]],
update_inventory?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ValueTypes["inventory_inc_input"] | undefined | null | Variable<any, string>,	/** sets the columns of the filtered rows to the given values */
	_set?: ValueTypes["inventory_set_input"] | undefined | null | Variable<any, string>,	/** filter the rows which have to be updated */
	where: ValueTypes["inventory_bool_exp"] | Variable<any, string>},ValueTypes["inventory_mutation_response"]],
update_inventory_by_pk?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ValueTypes["inventory_inc_input"] | undefined | null | Variable<any, string>,	/** sets the columns of the filtered rows to the given values */
	_set?: ValueTypes["inventory_set_input"] | undefined | null | Variable<any, string>,	pk_columns: ValueTypes["inventory_pk_columns_input"] | Variable<any, string>},ValueTypes["inventory"]],
update_inventory_many?: [{	/** updates to execute, in order */
	updates: Array<ValueTypes["inventory_updates"]> | Variable<any, string>},ValueTypes["inventory_mutation_response"]],
update_language?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ValueTypes["language_inc_input"] | undefined | null | Variable<any, string>,	/** sets the columns of the filtered rows to the given values */
	_set?: ValueTypes["language_set_input"] | undefined | null | Variable<any, string>,	/** filter the rows which have to be updated */
	where: ValueTypes["language_bool_exp"] | Variable<any, string>},ValueTypes["language_mutation_response"]],
update_language_by_pk?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ValueTypes["language_inc_input"] | undefined | null | Variable<any, string>,	/** sets the columns of the filtered rows to the given values */
	_set?: ValueTypes["language_set_input"] | undefined | null | Variable<any, string>,	pk_columns: ValueTypes["language_pk_columns_input"] | Variable<any, string>},ValueTypes["language"]],
update_language_many?: [{	/** updates to execute, in order */
	updates: Array<ValueTypes["language_updates"]> | Variable<any, string>},ValueTypes["language_mutation_response"]],
update_payment?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ValueTypes["payment_inc_input"] | undefined | null | Variable<any, string>,	/** sets the columns of the filtered rows to the given values */
	_set?: ValueTypes["payment_set_input"] | undefined | null | Variable<any, string>,	/** filter the rows which have to be updated */
	where: ValueTypes["payment_bool_exp"] | Variable<any, string>},ValueTypes["payment_mutation_response"]],
update_payment_by_pk?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ValueTypes["payment_inc_input"] | undefined | null | Variable<any, string>,	/** sets the columns of the filtered rows to the given values */
	_set?: ValueTypes["payment_set_input"] | undefined | null | Variable<any, string>,	pk_columns: ValueTypes["payment_pk_columns_input"] | Variable<any, string>},ValueTypes["payment"]],
update_payment_many?: [{	/** updates to execute, in order */
	updates: Array<ValueTypes["payment_updates"]> | Variable<any, string>},ValueTypes["payment_mutation_response"]],
update_rental?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ValueTypes["rental_inc_input"] | undefined | null | Variable<any, string>,	/** sets the columns of the filtered rows to the given values */
	_set?: ValueTypes["rental_set_input"] | undefined | null | Variable<any, string>,	/** filter the rows which have to be updated */
	where: ValueTypes["rental_bool_exp"] | Variable<any, string>},ValueTypes["rental_mutation_response"]],
update_rental_by_pk?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ValueTypes["rental_inc_input"] | undefined | null | Variable<any, string>,	/** sets the columns of the filtered rows to the given values */
	_set?: ValueTypes["rental_set_input"] | undefined | null | Variable<any, string>,	pk_columns: ValueTypes["rental_pk_columns_input"] | Variable<any, string>},ValueTypes["rental"]],
update_rental_many?: [{	/** updates to execute, in order */
	updates: Array<ValueTypes["rental_updates"]> | Variable<any, string>},ValueTypes["rental_mutation_response"]],
update_staff?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ValueTypes["staff_inc_input"] | undefined | null | Variable<any, string>,	/** sets the columns of the filtered rows to the given values */
	_set?: ValueTypes["staff_set_input"] | undefined | null | Variable<any, string>,	/** filter the rows which have to be updated */
	where: ValueTypes["staff_bool_exp"] | Variable<any, string>},ValueTypes["staff_mutation_response"]],
update_staff_by_pk?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ValueTypes["staff_inc_input"] | undefined | null | Variable<any, string>,	/** sets the columns of the filtered rows to the given values */
	_set?: ValueTypes["staff_set_input"] | undefined | null | Variable<any, string>,	pk_columns: ValueTypes["staff_pk_columns_input"] | Variable<any, string>},ValueTypes["staff"]],
update_staff_many?: [{	/** updates to execute, in order */
	updates: Array<ValueTypes["staff_updates"]> | Variable<any, string>},ValueTypes["staff_mutation_response"]],
update_store?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ValueTypes["store_inc_input"] | undefined | null | Variable<any, string>,	/** sets the columns of the filtered rows to the given values */
	_set?: ValueTypes["store_set_input"] | undefined | null | Variable<any, string>,	/** filter the rows which have to be updated */
	where: ValueTypes["store_bool_exp"] | Variable<any, string>},ValueTypes["store_mutation_response"]],
update_store_by_pk?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ValueTypes["store_inc_input"] | undefined | null | Variable<any, string>,	/** sets the columns of the filtered rows to the given values */
	_set?: ValueTypes["store_set_input"] | undefined | null | Variable<any, string>,	pk_columns: ValueTypes["store_pk_columns_input"] | Variable<any, string>},ValueTypes["store"]],
update_store_many?: [{	/** updates to execute, in order */
	updates: Array<ValueTypes["store_updates"]> | Variable<any, string>},ValueTypes["store_mutation_response"]],
		__typename?: boolean | `@${string}`
}>;
	/** columns and relationships of "nicer_but_slower_film_list" */
["nicer_but_slower_film_list"]: AliasType<{
	actors?:boolean | `@${string}`,
	category?:boolean | `@${string}`,
	description?:boolean | `@${string}`,
	fid?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	price?:boolean | `@${string}`,
	rating?:boolean | `@${string}`,
	title?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregated selection of "nicer_but_slower_film_list" */
["nicer_but_slower_film_list_aggregate"]: AliasType<{
	aggregate?:ValueTypes["nicer_but_slower_film_list_aggregate_fields"],
	nodes?:ValueTypes["nicer_but_slower_film_list"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate fields of "nicer_but_slower_film_list" */
["nicer_but_slower_film_list_aggregate_fields"]: AliasType<{
	avg?:ValueTypes["nicer_but_slower_film_list_avg_fields"],
count?: [{	columns?: Array<ValueTypes["nicer_but_slower_film_list_select_column"]> | undefined | null | Variable<any, string>,	distinct?: boolean | undefined | null | Variable<any, string>},boolean | `@${string}`],
	max?:ValueTypes["nicer_but_slower_film_list_max_fields"],
	min?:ValueTypes["nicer_but_slower_film_list_min_fields"],
	stddev?:ValueTypes["nicer_but_slower_film_list_stddev_fields"],
	stddev_pop?:ValueTypes["nicer_but_slower_film_list_stddev_pop_fields"],
	stddev_samp?:ValueTypes["nicer_but_slower_film_list_stddev_samp_fields"],
	sum?:ValueTypes["nicer_but_slower_film_list_sum_fields"],
	var_pop?:ValueTypes["nicer_but_slower_film_list_var_pop_fields"],
	var_samp?:ValueTypes["nicer_but_slower_film_list_var_samp_fields"],
	variance?:ValueTypes["nicer_but_slower_film_list_variance_fields"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate avg on columns */
["nicer_but_slower_film_list_avg_fields"]: AliasType<{
	fid?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	price?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Boolean expression to filter rows from the table "nicer_but_slower_film_list". All fields are combined with a logical 'AND'. */
["nicer_but_slower_film_list_bool_exp"]: {
	_and?: Array<ValueTypes["nicer_but_slower_film_list_bool_exp"]> | undefined | null | Variable<any, string>,
	_not?: ValueTypes["nicer_but_slower_film_list_bool_exp"] | undefined | null | Variable<any, string>,
	_or?: Array<ValueTypes["nicer_but_slower_film_list_bool_exp"]> | undefined | null | Variable<any, string>,
	actors?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
	category?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
	description?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
	fid?: ValueTypes["Int_comparison_exp"] | undefined | null | Variable<any, string>,
	length?: ValueTypes["smallint_comparison_exp"] | undefined | null | Variable<any, string>,
	price?: ValueTypes["numeric_comparison_exp"] | undefined | null | Variable<any, string>,
	rating?: ValueTypes["mpaa_rating_comparison_exp"] | undefined | null | Variable<any, string>,
	title?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>
};
	/** aggregate max on columns */
["nicer_but_slower_film_list_max_fields"]: AliasType<{
	actors?:boolean | `@${string}`,
	category?:boolean | `@${string}`,
	description?:boolean | `@${string}`,
	fid?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	price?:boolean | `@${string}`,
	rating?:boolean | `@${string}`,
	title?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate min on columns */
["nicer_but_slower_film_list_min_fields"]: AliasType<{
	actors?:boolean | `@${string}`,
	category?:boolean | `@${string}`,
	description?:boolean | `@${string}`,
	fid?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	price?:boolean | `@${string}`,
	rating?:boolean | `@${string}`,
	title?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Ordering options when selecting data from "nicer_but_slower_film_list". */
["nicer_but_slower_film_list_order_by"]: {
	actors?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	category?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	description?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	fid?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	length?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	price?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	rating?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	title?: ValueTypes["order_by"] | undefined | null | Variable<any, string>
};
	/** select columns of table "nicer_but_slower_film_list" */
["nicer_but_slower_film_list_select_column"]:nicer_but_slower_film_list_select_column;
	/** aggregate stddev on columns */
["nicer_but_slower_film_list_stddev_fields"]: AliasType<{
	fid?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	price?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_pop on columns */
["nicer_but_slower_film_list_stddev_pop_fields"]: AliasType<{
	fid?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	price?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_samp on columns */
["nicer_but_slower_film_list_stddev_samp_fields"]: AliasType<{
	fid?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	price?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Streaming cursor of the table "nicer_but_slower_film_list" */
["nicer_but_slower_film_list_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ValueTypes["nicer_but_slower_film_list_stream_cursor_value_input"] | Variable<any, string>,
	/** cursor ordering */
	ordering?: ValueTypes["cursor_ordering"] | undefined | null | Variable<any, string>
};
	/** Initial value of the column from where the streaming should start */
["nicer_but_slower_film_list_stream_cursor_value_input"]: {
	actors?: string | undefined | null | Variable<any, string>,
	category?: string | undefined | null | Variable<any, string>,
	description?: string | undefined | null | Variable<any, string>,
	fid?: number | undefined | null | Variable<any, string>,
	length?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	price?: ValueTypes["numeric"] | undefined | null | Variable<any, string>,
	rating?: ValueTypes["mpaa_rating"] | undefined | null | Variable<any, string>,
	title?: string | undefined | null | Variable<any, string>
};
	/** aggregate sum on columns */
["nicer_but_slower_film_list_sum_fields"]: AliasType<{
	fid?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	price?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_pop on columns */
["nicer_but_slower_film_list_var_pop_fields"]: AliasType<{
	fid?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	price?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_samp on columns */
["nicer_but_slower_film_list_var_samp_fields"]: AliasType<{
	fid?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	price?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate variance on columns */
["nicer_but_slower_film_list_variance_fields"]: AliasType<{
	fid?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	price?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	["numeric"]:unknown;
	/** Boolean expression to compare columns of type "numeric". All fields are combined with logical 'AND'. */
["numeric_comparison_exp"]: {
	_eq?: ValueTypes["numeric"] | undefined | null | Variable<any, string>,
	_gt?: ValueTypes["numeric"] | undefined | null | Variable<any, string>,
	_gte?: ValueTypes["numeric"] | undefined | null | Variable<any, string>,
	_in?: Array<ValueTypes["numeric"]> | undefined | null | Variable<any, string>,
	_is_null?: boolean | undefined | null | Variable<any, string>,
	_lt?: ValueTypes["numeric"] | undefined | null | Variable<any, string>,
	_lte?: ValueTypes["numeric"] | undefined | null | Variable<any, string>,
	_neq?: ValueTypes["numeric"] | undefined | null | Variable<any, string>,
	_nin?: Array<ValueTypes["numeric"]> | undefined | null | Variable<any, string>
};
	/** column ordering options */
["order_by"]:order_by;
	/** columns and relationships of "payment" */
["payment"]: AliasType<{
	amount?:boolean | `@${string}`,
	customer_id?:boolean | `@${string}`,
	payment_date?:boolean | `@${string}`,
	payment_id?:boolean | `@${string}`,
	rental_id?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregated selection of "payment" */
["payment_aggregate"]: AliasType<{
	aggregate?:ValueTypes["payment_aggregate_fields"],
	nodes?:ValueTypes["payment"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate fields of "payment" */
["payment_aggregate_fields"]: AliasType<{
	avg?:ValueTypes["payment_avg_fields"],
count?: [{	columns?: Array<ValueTypes["payment_select_column"]> | undefined | null | Variable<any, string>,	distinct?: boolean | undefined | null | Variable<any, string>},boolean | `@${string}`],
	max?:ValueTypes["payment_max_fields"],
	min?:ValueTypes["payment_min_fields"],
	stddev?:ValueTypes["payment_stddev_fields"],
	stddev_pop?:ValueTypes["payment_stddev_pop_fields"],
	stddev_samp?:ValueTypes["payment_stddev_samp_fields"],
	sum?:ValueTypes["payment_sum_fields"],
	var_pop?:ValueTypes["payment_var_pop_fields"],
	var_samp?:ValueTypes["payment_var_samp_fields"],
	variance?:ValueTypes["payment_variance_fields"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate avg on columns */
["payment_avg_fields"]: AliasType<{
	amount?:boolean | `@${string}`,
	customer_id?:boolean | `@${string}`,
	payment_id?:boolean | `@${string}`,
	rental_id?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Boolean expression to filter rows from the table "payment". All fields are combined with a logical 'AND'. */
["payment_bool_exp"]: {
	_and?: Array<ValueTypes["payment_bool_exp"]> | undefined | null | Variable<any, string>,
	_not?: ValueTypes["payment_bool_exp"] | undefined | null | Variable<any, string>,
	_or?: Array<ValueTypes["payment_bool_exp"]> | undefined | null | Variable<any, string>,
	amount?: ValueTypes["numeric_comparison_exp"] | undefined | null | Variable<any, string>,
	customer_id?: ValueTypes["smallint_comparison_exp"] | undefined | null | Variable<any, string>,
	payment_date?: ValueTypes["timestamp_comparison_exp"] | undefined | null | Variable<any, string>,
	payment_id?: ValueTypes["Int_comparison_exp"] | undefined | null | Variable<any, string>,
	rental_id?: ValueTypes["Int_comparison_exp"] | undefined | null | Variable<any, string>,
	staff_id?: ValueTypes["smallint_comparison_exp"] | undefined | null | Variable<any, string>
};
	/** unique or primary key constraints on table "payment" */
["payment_constraint"]:payment_constraint;
	/** input type for incrementing numeric columns in table "payment" */
["payment_inc_input"]: {
	amount?: ValueTypes["numeric"] | undefined | null | Variable<any, string>,
	customer_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	payment_id?: number | undefined | null | Variable<any, string>,
	rental_id?: number | undefined | null | Variable<any, string>,
	staff_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>
};
	/** input type for inserting data into table "payment" */
["payment_insert_input"]: {
	amount?: ValueTypes["numeric"] | undefined | null | Variable<any, string>,
	customer_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	payment_date?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>,
	payment_id?: number | undefined | null | Variable<any, string>,
	rental_id?: number | undefined | null | Variable<any, string>,
	staff_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>
};
	/** aggregate max on columns */
["payment_max_fields"]: AliasType<{
	amount?:boolean | `@${string}`,
	customer_id?:boolean | `@${string}`,
	payment_date?:boolean | `@${string}`,
	payment_id?:boolean | `@${string}`,
	rental_id?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate min on columns */
["payment_min_fields"]: AliasType<{
	amount?:boolean | `@${string}`,
	customer_id?:boolean | `@${string}`,
	payment_date?:boolean | `@${string}`,
	payment_id?:boolean | `@${string}`,
	rental_id?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** response of any mutation on the table "payment" */
["payment_mutation_response"]: AliasType<{
	/** number of rows affected by the mutation */
	affected_rows?:boolean | `@${string}`,
	/** data from the rows affected by the mutation */
	returning?:ValueTypes["payment"],
		__typename?: boolean | `@${string}`
}>;
	/** on_conflict condition type for table "payment" */
["payment_on_conflict"]: {
	constraint: ValueTypes["payment_constraint"] | Variable<any, string>,
	update_columns: Array<ValueTypes["payment_update_column"]> | Variable<any, string>,
	where?: ValueTypes["payment_bool_exp"] | undefined | null | Variable<any, string>
};
	/** Ordering options when selecting data from "payment". */
["payment_order_by"]: {
	amount?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	customer_id?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	payment_date?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	payment_id?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	rental_id?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	staff_id?: ValueTypes["order_by"] | undefined | null | Variable<any, string>
};
	/** primary key columns input for table: payment */
["payment_pk_columns_input"]: {
	payment_id: number | Variable<any, string>
};
	/** select columns of table "payment" */
["payment_select_column"]:payment_select_column;
	/** input type for updating data in table "payment" */
["payment_set_input"]: {
	amount?: ValueTypes["numeric"] | undefined | null | Variable<any, string>,
	customer_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	payment_date?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>,
	payment_id?: number | undefined | null | Variable<any, string>,
	rental_id?: number | undefined | null | Variable<any, string>,
	staff_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>
};
	/** aggregate stddev on columns */
["payment_stddev_fields"]: AliasType<{
	amount?:boolean | `@${string}`,
	customer_id?:boolean | `@${string}`,
	payment_id?:boolean | `@${string}`,
	rental_id?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_pop on columns */
["payment_stddev_pop_fields"]: AliasType<{
	amount?:boolean | `@${string}`,
	customer_id?:boolean | `@${string}`,
	payment_id?:boolean | `@${string}`,
	rental_id?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_samp on columns */
["payment_stddev_samp_fields"]: AliasType<{
	amount?:boolean | `@${string}`,
	customer_id?:boolean | `@${string}`,
	payment_id?:boolean | `@${string}`,
	rental_id?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Streaming cursor of the table "payment" */
["payment_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ValueTypes["payment_stream_cursor_value_input"] | Variable<any, string>,
	/** cursor ordering */
	ordering?: ValueTypes["cursor_ordering"] | undefined | null | Variable<any, string>
};
	/** Initial value of the column from where the streaming should start */
["payment_stream_cursor_value_input"]: {
	amount?: ValueTypes["numeric"] | undefined | null | Variable<any, string>,
	customer_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	payment_date?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>,
	payment_id?: number | undefined | null | Variable<any, string>,
	rental_id?: number | undefined | null | Variable<any, string>,
	staff_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>
};
	/** aggregate sum on columns */
["payment_sum_fields"]: AliasType<{
	amount?:boolean | `@${string}`,
	customer_id?:boolean | `@${string}`,
	payment_id?:boolean | `@${string}`,
	rental_id?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** update columns of table "payment" */
["payment_update_column"]:payment_update_column;
	["payment_updates"]: {
	/** increments the numeric columns with given value of the filtered values */
	_inc?: ValueTypes["payment_inc_input"] | undefined | null | Variable<any, string>,
	/** sets the columns of the filtered rows to the given values */
	_set?: ValueTypes["payment_set_input"] | undefined | null | Variable<any, string>,
	/** filter the rows which have to be updated */
	where: ValueTypes["payment_bool_exp"] | Variable<any, string>
};
	/** aggregate var_pop on columns */
["payment_var_pop_fields"]: AliasType<{
	amount?:boolean | `@${string}`,
	customer_id?:boolean | `@${string}`,
	payment_id?:boolean | `@${string}`,
	rental_id?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_samp on columns */
["payment_var_samp_fields"]: AliasType<{
	amount?:boolean | `@${string}`,
	customer_id?:boolean | `@${string}`,
	payment_id?:boolean | `@${string}`,
	rental_id?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate variance on columns */
["payment_variance_fields"]: AliasType<{
	amount?:boolean | `@${string}`,
	customer_id?:boolean | `@${string}`,
	payment_id?:boolean | `@${string}`,
	rental_id?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	["query_root"]: AliasType<{
actor?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["actor_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["actor_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["actor_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["actor"]],
actor_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["actor_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["actor_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["actor_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["actor_aggregate"]],
actor_by_pk?: [{	actor_id: number | Variable<any, string>},ValueTypes["actor"]],
actor_info?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["actor_info_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["actor_info_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["actor_info_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["actor_info"]],
actor_info_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["actor_info_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["actor_info_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["actor_info_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["actor_info_aggregate"]],
address?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["address_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["address_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["address_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["address"]],
address_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["address_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["address_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["address_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["address_aggregate"]],
address_by_pk?: [{	address_id: number | Variable<any, string>},ValueTypes["address"]],
category?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["category_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["category_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["category_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["category"]],
category_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["category_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["category_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["category_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["category_aggregate"]],
category_by_pk?: [{	category_id: number | Variable<any, string>},ValueTypes["category"]],
city?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["city_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["city_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["city_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["city"]],
city_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["city_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["city_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["city_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["city_aggregate"]],
city_by_pk?: [{	city_id: number | Variable<any, string>},ValueTypes["city"]],
country?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["country_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["country_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["country_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["country"]],
country_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["country_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["country_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["country_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["country_aggregate"]],
country_by_pk?: [{	country_id: number | Variable<any, string>},ValueTypes["country"]],
customer?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["customer_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["customer_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["customer_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["customer"]],
customer_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["customer_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["customer_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["customer_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["customer_aggregate"]],
customer_by_pk?: [{	customer_id: number | Variable<any, string>},ValueTypes["customer"]],
customer_list?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["customer_list_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["customer_list_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["customer_list_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["customer_list"]],
customer_list_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["customer_list_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["customer_list_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["customer_list_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["customer_list_aggregate"]],
film?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["film_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["film_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["film_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["film"]],
film_actor?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["film_actor_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["film_actor_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["film_actor_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["film_actor"]],
film_actor_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["film_actor_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["film_actor_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["film_actor_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["film_actor_aggregate"]],
film_actor_by_pk?: [{	actor_id: ValueTypes["smallint"] | Variable<any, string>,	film_id: ValueTypes["smallint"] | Variable<any, string>},ValueTypes["film_actor"]],
film_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["film_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["film_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["film_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["film_aggregate"]],
film_by_pk?: [{	film_id: number | Variable<any, string>},ValueTypes["film"]],
film_category?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["film_category_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["film_category_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["film_category_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["film_category"]],
film_category_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["film_category_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["film_category_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["film_category_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["film_category_aggregate"]],
film_category_by_pk?: [{	category_id: ValueTypes["smallint"] | Variable<any, string>,	film_id: ValueTypes["smallint"] | Variable<any, string>},ValueTypes["film_category"]],
film_list?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["film_list_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["film_list_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["film_list_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["film_list"]],
film_list_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["film_list_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["film_list_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["film_list_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["film_list_aggregate"]],
inventory?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["inventory_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["inventory_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["inventory_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["inventory"]],
inventory_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["inventory_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["inventory_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["inventory_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["inventory_aggregate"]],
inventory_by_pk?: [{	inventory_id: number | Variable<any, string>},ValueTypes["inventory"]],
language?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["language_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["language_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["language_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["language"]],
language_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["language_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["language_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["language_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["language_aggregate"]],
language_by_pk?: [{	language_id: number | Variable<any, string>},ValueTypes["language"]],
nicer_but_slower_film_list?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["nicer_but_slower_film_list_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["nicer_but_slower_film_list_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["nicer_but_slower_film_list_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["nicer_but_slower_film_list"]],
nicer_but_slower_film_list_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["nicer_but_slower_film_list_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["nicer_but_slower_film_list_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["nicer_but_slower_film_list_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["nicer_but_slower_film_list_aggregate"]],
payment?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["payment_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["payment_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["payment_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["payment"]],
payment_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["payment_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["payment_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["payment_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["payment_aggregate"]],
payment_by_pk?: [{	payment_id: number | Variable<any, string>},ValueTypes["payment"]],
rental?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["rental_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["rental_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["rental_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["rental"]],
rental_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["rental_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["rental_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["rental_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["rental_aggregate"]],
rental_by_pk?: [{	rental_id: number | Variable<any, string>},ValueTypes["rental"]],
sales_by_film_category?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["sales_by_film_category_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["sales_by_film_category_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["sales_by_film_category_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["sales_by_film_category"]],
sales_by_film_category_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["sales_by_film_category_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["sales_by_film_category_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["sales_by_film_category_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["sales_by_film_category_aggregate"]],
sales_by_store?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["sales_by_store_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["sales_by_store_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["sales_by_store_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["sales_by_store"]],
sales_by_store_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["sales_by_store_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["sales_by_store_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["sales_by_store_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["sales_by_store_aggregate"]],
staff?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["staff_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["staff_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["staff_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["staff"]],
staff_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["staff_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["staff_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["staff_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["staff_aggregate"]],
staff_by_pk?: [{	staff_id: number | Variable<any, string>},ValueTypes["staff"]],
staff_list?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["staff_list_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["staff_list_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["staff_list_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["staff_list"]],
staff_list_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["staff_list_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["staff_list_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["staff_list_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["staff_list_aggregate"]],
store?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["store_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["store_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["store_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["store"]],
store_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["store_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["store_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["store_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["store_aggregate"]],
store_by_pk?: [{	store_id: number | Variable<any, string>},ValueTypes["store"]],
		__typename?: boolean | `@${string}`
}>;
	/** columns and relationships of "rental" */
["rental"]: AliasType<{
	customer_id?:boolean | `@${string}`,
	inventory_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
	rental_date?:boolean | `@${string}`,
	rental_id?:boolean | `@${string}`,
	return_date?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregated selection of "rental" */
["rental_aggregate"]: AliasType<{
	aggregate?:ValueTypes["rental_aggregate_fields"],
	nodes?:ValueTypes["rental"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate fields of "rental" */
["rental_aggregate_fields"]: AliasType<{
	avg?:ValueTypes["rental_avg_fields"],
count?: [{	columns?: Array<ValueTypes["rental_select_column"]> | undefined | null | Variable<any, string>,	distinct?: boolean | undefined | null | Variable<any, string>},boolean | `@${string}`],
	max?:ValueTypes["rental_max_fields"],
	min?:ValueTypes["rental_min_fields"],
	stddev?:ValueTypes["rental_stddev_fields"],
	stddev_pop?:ValueTypes["rental_stddev_pop_fields"],
	stddev_samp?:ValueTypes["rental_stddev_samp_fields"],
	sum?:ValueTypes["rental_sum_fields"],
	var_pop?:ValueTypes["rental_var_pop_fields"],
	var_samp?:ValueTypes["rental_var_samp_fields"],
	variance?:ValueTypes["rental_variance_fields"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate avg on columns */
["rental_avg_fields"]: AliasType<{
	customer_id?:boolean | `@${string}`,
	inventory_id?:boolean | `@${string}`,
	rental_id?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Boolean expression to filter rows from the table "rental". All fields are combined with a logical 'AND'. */
["rental_bool_exp"]: {
	_and?: Array<ValueTypes["rental_bool_exp"]> | undefined | null | Variable<any, string>,
	_not?: ValueTypes["rental_bool_exp"] | undefined | null | Variable<any, string>,
	_or?: Array<ValueTypes["rental_bool_exp"]> | undefined | null | Variable<any, string>,
	customer_id?: ValueTypes["smallint_comparison_exp"] | undefined | null | Variable<any, string>,
	inventory_id?: ValueTypes["Int_comparison_exp"] | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp_comparison_exp"] | undefined | null | Variable<any, string>,
	rental_date?: ValueTypes["timestamp_comparison_exp"] | undefined | null | Variable<any, string>,
	rental_id?: ValueTypes["Int_comparison_exp"] | undefined | null | Variable<any, string>,
	return_date?: ValueTypes["timestamp_comparison_exp"] | undefined | null | Variable<any, string>,
	staff_id?: ValueTypes["smallint_comparison_exp"] | undefined | null | Variable<any, string>
};
	/** unique or primary key constraints on table "rental" */
["rental_constraint"]:rental_constraint;
	/** input type for incrementing numeric columns in table "rental" */
["rental_inc_input"]: {
	customer_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	inventory_id?: number | undefined | null | Variable<any, string>,
	rental_id?: number | undefined | null | Variable<any, string>,
	staff_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>
};
	/** input type for inserting data into table "rental" */
["rental_insert_input"]: {
	customer_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	inventory_id?: number | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>,
	rental_date?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>,
	rental_id?: number | undefined | null | Variable<any, string>,
	return_date?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>,
	staff_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>
};
	/** aggregate max on columns */
["rental_max_fields"]: AliasType<{
	customer_id?:boolean | `@${string}`,
	inventory_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
	rental_date?:boolean | `@${string}`,
	rental_id?:boolean | `@${string}`,
	return_date?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate min on columns */
["rental_min_fields"]: AliasType<{
	customer_id?:boolean | `@${string}`,
	inventory_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
	rental_date?:boolean | `@${string}`,
	rental_id?:boolean | `@${string}`,
	return_date?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** response of any mutation on the table "rental" */
["rental_mutation_response"]: AliasType<{
	/** number of rows affected by the mutation */
	affected_rows?:boolean | `@${string}`,
	/** data from the rows affected by the mutation */
	returning?:ValueTypes["rental"],
		__typename?: boolean | `@${string}`
}>;
	/** on_conflict condition type for table "rental" */
["rental_on_conflict"]: {
	constraint: ValueTypes["rental_constraint"] | Variable<any, string>,
	update_columns: Array<ValueTypes["rental_update_column"]> | Variable<any, string>,
	where?: ValueTypes["rental_bool_exp"] | undefined | null | Variable<any, string>
};
	/** Ordering options when selecting data from "rental". */
["rental_order_by"]: {
	customer_id?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	inventory_id?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	rental_date?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	rental_id?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	return_date?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	staff_id?: ValueTypes["order_by"] | undefined | null | Variable<any, string>
};
	/** primary key columns input for table: rental */
["rental_pk_columns_input"]: {
	rental_id: number | Variable<any, string>
};
	/** select columns of table "rental" */
["rental_select_column"]:rental_select_column;
	/** input type for updating data in table "rental" */
["rental_set_input"]: {
	customer_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	inventory_id?: number | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>,
	rental_date?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>,
	rental_id?: number | undefined | null | Variable<any, string>,
	return_date?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>,
	staff_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>
};
	/** aggregate stddev on columns */
["rental_stddev_fields"]: AliasType<{
	customer_id?:boolean | `@${string}`,
	inventory_id?:boolean | `@${string}`,
	rental_id?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_pop on columns */
["rental_stddev_pop_fields"]: AliasType<{
	customer_id?:boolean | `@${string}`,
	inventory_id?:boolean | `@${string}`,
	rental_id?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_samp on columns */
["rental_stddev_samp_fields"]: AliasType<{
	customer_id?:boolean | `@${string}`,
	inventory_id?:boolean | `@${string}`,
	rental_id?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Streaming cursor of the table "rental" */
["rental_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ValueTypes["rental_stream_cursor_value_input"] | Variable<any, string>,
	/** cursor ordering */
	ordering?: ValueTypes["cursor_ordering"] | undefined | null | Variable<any, string>
};
	/** Initial value of the column from where the streaming should start */
["rental_stream_cursor_value_input"]: {
	customer_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	inventory_id?: number | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>,
	rental_date?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>,
	rental_id?: number | undefined | null | Variable<any, string>,
	return_date?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>,
	staff_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>
};
	/** aggregate sum on columns */
["rental_sum_fields"]: AliasType<{
	customer_id?:boolean | `@${string}`,
	inventory_id?:boolean | `@${string}`,
	rental_id?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** update columns of table "rental" */
["rental_update_column"]:rental_update_column;
	["rental_updates"]: {
	/** increments the numeric columns with given value of the filtered values */
	_inc?: ValueTypes["rental_inc_input"] | undefined | null | Variable<any, string>,
	/** sets the columns of the filtered rows to the given values */
	_set?: ValueTypes["rental_set_input"] | undefined | null | Variable<any, string>,
	/** filter the rows which have to be updated */
	where: ValueTypes["rental_bool_exp"] | Variable<any, string>
};
	/** aggregate var_pop on columns */
["rental_var_pop_fields"]: AliasType<{
	customer_id?:boolean | `@${string}`,
	inventory_id?:boolean | `@${string}`,
	rental_id?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_samp on columns */
["rental_var_samp_fields"]: AliasType<{
	customer_id?:boolean | `@${string}`,
	inventory_id?:boolean | `@${string}`,
	rental_id?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate variance on columns */
["rental_variance_fields"]: AliasType<{
	customer_id?:boolean | `@${string}`,
	inventory_id?:boolean | `@${string}`,
	rental_id?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** columns and relationships of "sales_by_film_category" */
["sales_by_film_category"]: AliasType<{
	category?:boolean | `@${string}`,
	total_sales?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregated selection of "sales_by_film_category" */
["sales_by_film_category_aggregate"]: AliasType<{
	aggregate?:ValueTypes["sales_by_film_category_aggregate_fields"],
	nodes?:ValueTypes["sales_by_film_category"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate fields of "sales_by_film_category" */
["sales_by_film_category_aggregate_fields"]: AliasType<{
	avg?:ValueTypes["sales_by_film_category_avg_fields"],
count?: [{	columns?: Array<ValueTypes["sales_by_film_category_select_column"]> | undefined | null | Variable<any, string>,	distinct?: boolean | undefined | null | Variable<any, string>},boolean | `@${string}`],
	max?:ValueTypes["sales_by_film_category_max_fields"],
	min?:ValueTypes["sales_by_film_category_min_fields"],
	stddev?:ValueTypes["sales_by_film_category_stddev_fields"],
	stddev_pop?:ValueTypes["sales_by_film_category_stddev_pop_fields"],
	stddev_samp?:ValueTypes["sales_by_film_category_stddev_samp_fields"],
	sum?:ValueTypes["sales_by_film_category_sum_fields"],
	var_pop?:ValueTypes["sales_by_film_category_var_pop_fields"],
	var_samp?:ValueTypes["sales_by_film_category_var_samp_fields"],
	variance?:ValueTypes["sales_by_film_category_variance_fields"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate avg on columns */
["sales_by_film_category_avg_fields"]: AliasType<{
	total_sales?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Boolean expression to filter rows from the table "sales_by_film_category". All fields are combined with a logical 'AND'. */
["sales_by_film_category_bool_exp"]: {
	_and?: Array<ValueTypes["sales_by_film_category_bool_exp"]> | undefined | null | Variable<any, string>,
	_not?: ValueTypes["sales_by_film_category_bool_exp"] | undefined | null | Variable<any, string>,
	_or?: Array<ValueTypes["sales_by_film_category_bool_exp"]> | undefined | null | Variable<any, string>,
	category?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
	total_sales?: ValueTypes["numeric_comparison_exp"] | undefined | null | Variable<any, string>
};
	/** aggregate max on columns */
["sales_by_film_category_max_fields"]: AliasType<{
	category?:boolean | `@${string}`,
	total_sales?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate min on columns */
["sales_by_film_category_min_fields"]: AliasType<{
	category?:boolean | `@${string}`,
	total_sales?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Ordering options when selecting data from "sales_by_film_category". */
["sales_by_film_category_order_by"]: {
	category?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	total_sales?: ValueTypes["order_by"] | undefined | null | Variable<any, string>
};
	/** select columns of table "sales_by_film_category" */
["sales_by_film_category_select_column"]:sales_by_film_category_select_column;
	/** aggregate stddev on columns */
["sales_by_film_category_stddev_fields"]: AliasType<{
	total_sales?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_pop on columns */
["sales_by_film_category_stddev_pop_fields"]: AliasType<{
	total_sales?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_samp on columns */
["sales_by_film_category_stddev_samp_fields"]: AliasType<{
	total_sales?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Streaming cursor of the table "sales_by_film_category" */
["sales_by_film_category_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ValueTypes["sales_by_film_category_stream_cursor_value_input"] | Variable<any, string>,
	/** cursor ordering */
	ordering?: ValueTypes["cursor_ordering"] | undefined | null | Variable<any, string>
};
	/** Initial value of the column from where the streaming should start */
["sales_by_film_category_stream_cursor_value_input"]: {
	category?: string | undefined | null | Variable<any, string>,
	total_sales?: ValueTypes["numeric"] | undefined | null | Variable<any, string>
};
	/** aggregate sum on columns */
["sales_by_film_category_sum_fields"]: AliasType<{
	total_sales?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_pop on columns */
["sales_by_film_category_var_pop_fields"]: AliasType<{
	total_sales?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_samp on columns */
["sales_by_film_category_var_samp_fields"]: AliasType<{
	total_sales?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate variance on columns */
["sales_by_film_category_variance_fields"]: AliasType<{
	total_sales?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** columns and relationships of "sales_by_store" */
["sales_by_store"]: AliasType<{
	manager?:boolean | `@${string}`,
	store?:boolean | `@${string}`,
	total_sales?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregated selection of "sales_by_store" */
["sales_by_store_aggregate"]: AliasType<{
	aggregate?:ValueTypes["sales_by_store_aggregate_fields"],
	nodes?:ValueTypes["sales_by_store"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate fields of "sales_by_store" */
["sales_by_store_aggregate_fields"]: AliasType<{
	avg?:ValueTypes["sales_by_store_avg_fields"],
count?: [{	columns?: Array<ValueTypes["sales_by_store_select_column"]> | undefined | null | Variable<any, string>,	distinct?: boolean | undefined | null | Variable<any, string>},boolean | `@${string}`],
	max?:ValueTypes["sales_by_store_max_fields"],
	min?:ValueTypes["sales_by_store_min_fields"],
	stddev?:ValueTypes["sales_by_store_stddev_fields"],
	stddev_pop?:ValueTypes["sales_by_store_stddev_pop_fields"],
	stddev_samp?:ValueTypes["sales_by_store_stddev_samp_fields"],
	sum?:ValueTypes["sales_by_store_sum_fields"],
	var_pop?:ValueTypes["sales_by_store_var_pop_fields"],
	var_samp?:ValueTypes["sales_by_store_var_samp_fields"],
	variance?:ValueTypes["sales_by_store_variance_fields"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate avg on columns */
["sales_by_store_avg_fields"]: AliasType<{
	total_sales?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Boolean expression to filter rows from the table "sales_by_store". All fields are combined with a logical 'AND'. */
["sales_by_store_bool_exp"]: {
	_and?: Array<ValueTypes["sales_by_store_bool_exp"]> | undefined | null | Variable<any, string>,
	_not?: ValueTypes["sales_by_store_bool_exp"] | undefined | null | Variable<any, string>,
	_or?: Array<ValueTypes["sales_by_store_bool_exp"]> | undefined | null | Variable<any, string>,
	manager?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
	store?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
	total_sales?: ValueTypes["numeric_comparison_exp"] | undefined | null | Variable<any, string>
};
	/** aggregate max on columns */
["sales_by_store_max_fields"]: AliasType<{
	manager?:boolean | `@${string}`,
	store?:boolean | `@${string}`,
	total_sales?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate min on columns */
["sales_by_store_min_fields"]: AliasType<{
	manager?:boolean | `@${string}`,
	store?:boolean | `@${string}`,
	total_sales?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Ordering options when selecting data from "sales_by_store". */
["sales_by_store_order_by"]: {
	manager?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	store?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	total_sales?: ValueTypes["order_by"] | undefined | null | Variable<any, string>
};
	/** select columns of table "sales_by_store" */
["sales_by_store_select_column"]:sales_by_store_select_column;
	/** aggregate stddev on columns */
["sales_by_store_stddev_fields"]: AliasType<{
	total_sales?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_pop on columns */
["sales_by_store_stddev_pop_fields"]: AliasType<{
	total_sales?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_samp on columns */
["sales_by_store_stddev_samp_fields"]: AliasType<{
	total_sales?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Streaming cursor of the table "sales_by_store" */
["sales_by_store_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ValueTypes["sales_by_store_stream_cursor_value_input"] | Variable<any, string>,
	/** cursor ordering */
	ordering?: ValueTypes["cursor_ordering"] | undefined | null | Variable<any, string>
};
	/** Initial value of the column from where the streaming should start */
["sales_by_store_stream_cursor_value_input"]: {
	manager?: string | undefined | null | Variable<any, string>,
	store?: string | undefined | null | Variable<any, string>,
	total_sales?: ValueTypes["numeric"] | undefined | null | Variable<any, string>
};
	/** aggregate sum on columns */
["sales_by_store_sum_fields"]: AliasType<{
	total_sales?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_pop on columns */
["sales_by_store_var_pop_fields"]: AliasType<{
	total_sales?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_samp on columns */
["sales_by_store_var_samp_fields"]: AliasType<{
	total_sales?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate variance on columns */
["sales_by_store_variance_fields"]: AliasType<{
	total_sales?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	["smallint"]:unknown;
	/** Boolean expression to compare columns of type "smallint". All fields are combined with logical 'AND'. */
["smallint_comparison_exp"]: {
	_eq?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	_gt?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	_gte?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	_in?: Array<ValueTypes["smallint"]> | undefined | null | Variable<any, string>,
	_is_null?: boolean | undefined | null | Variable<any, string>,
	_lt?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	_lte?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	_neq?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	_nin?: Array<ValueTypes["smallint"]> | undefined | null | Variable<any, string>
};
	/** columns and relationships of "staff" */
["staff"]: AliasType<{
	active?:boolean | `@${string}`,
	address_id?:boolean | `@${string}`,
	email?:boolean | `@${string}`,
	first_name?:boolean | `@${string}`,
	last_name?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
	password?:boolean | `@${string}`,
	picture?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
	username?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregated selection of "staff" */
["staff_aggregate"]: AliasType<{
	aggregate?:ValueTypes["staff_aggregate_fields"],
	nodes?:ValueTypes["staff"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate fields of "staff" */
["staff_aggregate_fields"]: AliasType<{
	avg?:ValueTypes["staff_avg_fields"],
count?: [{	columns?: Array<ValueTypes["staff_select_column"]> | undefined | null | Variable<any, string>,	distinct?: boolean | undefined | null | Variable<any, string>},boolean | `@${string}`],
	max?:ValueTypes["staff_max_fields"],
	min?:ValueTypes["staff_min_fields"],
	stddev?:ValueTypes["staff_stddev_fields"],
	stddev_pop?:ValueTypes["staff_stddev_pop_fields"],
	stddev_samp?:ValueTypes["staff_stddev_samp_fields"],
	sum?:ValueTypes["staff_sum_fields"],
	var_pop?:ValueTypes["staff_var_pop_fields"],
	var_samp?:ValueTypes["staff_var_samp_fields"],
	variance?:ValueTypes["staff_variance_fields"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate avg on columns */
["staff_avg_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Boolean expression to filter rows from the table "staff". All fields are combined with a logical 'AND'. */
["staff_bool_exp"]: {
	_and?: Array<ValueTypes["staff_bool_exp"]> | undefined | null | Variable<any, string>,
	_not?: ValueTypes["staff_bool_exp"] | undefined | null | Variable<any, string>,
	_or?: Array<ValueTypes["staff_bool_exp"]> | undefined | null | Variable<any, string>,
	active?: ValueTypes["Boolean_comparison_exp"] | undefined | null | Variable<any, string>,
	address_id?: ValueTypes["smallint_comparison_exp"] | undefined | null | Variable<any, string>,
	email?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
	first_name?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
	last_name?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp_comparison_exp"] | undefined | null | Variable<any, string>,
	password?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
	picture?: ValueTypes["bytea_comparison_exp"] | undefined | null | Variable<any, string>,
	staff_id?: ValueTypes["Int_comparison_exp"] | undefined | null | Variable<any, string>,
	store_id?: ValueTypes["smallint_comparison_exp"] | undefined | null | Variable<any, string>,
	username?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>
};
	/** unique or primary key constraints on table "staff" */
["staff_constraint"]:staff_constraint;
	/** input type for incrementing numeric columns in table "staff" */
["staff_inc_input"]: {
	address_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	staff_id?: number | undefined | null | Variable<any, string>,
	store_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>
};
	/** input type for inserting data into table "staff" */
["staff_insert_input"]: {
	active?: boolean | undefined | null | Variable<any, string>,
	address_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	email?: string | undefined | null | Variable<any, string>,
	first_name?: string | undefined | null | Variable<any, string>,
	last_name?: string | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>,
	password?: string | undefined | null | Variable<any, string>,
	picture?: ValueTypes["bytea"] | undefined | null | Variable<any, string>,
	staff_id?: number | undefined | null | Variable<any, string>,
	store_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	username?: string | undefined | null | Variable<any, string>
};
	/** columns and relationships of "staff_list" */
["staff_list"]: AliasType<{
	address?:boolean | `@${string}`,
	city?:boolean | `@${string}`,
	country?:boolean | `@${string}`,
	id?:boolean | `@${string}`,
	name?:boolean | `@${string}`,
	phone?:boolean | `@${string}`,
	sid?:boolean | `@${string}`,
	zip_code?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregated selection of "staff_list" */
["staff_list_aggregate"]: AliasType<{
	aggregate?:ValueTypes["staff_list_aggregate_fields"],
	nodes?:ValueTypes["staff_list"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate fields of "staff_list" */
["staff_list_aggregate_fields"]: AliasType<{
	avg?:ValueTypes["staff_list_avg_fields"],
count?: [{	columns?: Array<ValueTypes["staff_list_select_column"]> | undefined | null | Variable<any, string>,	distinct?: boolean | undefined | null | Variable<any, string>},boolean | `@${string}`],
	max?:ValueTypes["staff_list_max_fields"],
	min?:ValueTypes["staff_list_min_fields"],
	stddev?:ValueTypes["staff_list_stddev_fields"],
	stddev_pop?:ValueTypes["staff_list_stddev_pop_fields"],
	stddev_samp?:ValueTypes["staff_list_stddev_samp_fields"],
	sum?:ValueTypes["staff_list_sum_fields"],
	var_pop?:ValueTypes["staff_list_var_pop_fields"],
	var_samp?:ValueTypes["staff_list_var_samp_fields"],
	variance?:ValueTypes["staff_list_variance_fields"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate avg on columns */
["staff_list_avg_fields"]: AliasType<{
	id?:boolean | `@${string}`,
	sid?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Boolean expression to filter rows from the table "staff_list". All fields are combined with a logical 'AND'. */
["staff_list_bool_exp"]: {
	_and?: Array<ValueTypes["staff_list_bool_exp"]> | undefined | null | Variable<any, string>,
	_not?: ValueTypes["staff_list_bool_exp"] | undefined | null | Variable<any, string>,
	_or?: Array<ValueTypes["staff_list_bool_exp"]> | undefined | null | Variable<any, string>,
	address?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
	city?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
	country?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
	id?: ValueTypes["Int_comparison_exp"] | undefined | null | Variable<any, string>,
	name?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
	phone?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>,
	sid?: ValueTypes["smallint_comparison_exp"] | undefined | null | Variable<any, string>,
	zip_code?: ValueTypes["String_comparison_exp"] | undefined | null | Variable<any, string>
};
	/** aggregate max on columns */
["staff_list_max_fields"]: AliasType<{
	address?:boolean | `@${string}`,
	city?:boolean | `@${string}`,
	country?:boolean | `@${string}`,
	id?:boolean | `@${string}`,
	name?:boolean | `@${string}`,
	phone?:boolean | `@${string}`,
	sid?:boolean | `@${string}`,
	zip_code?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate min on columns */
["staff_list_min_fields"]: AliasType<{
	address?:boolean | `@${string}`,
	city?:boolean | `@${string}`,
	country?:boolean | `@${string}`,
	id?:boolean | `@${string}`,
	name?:boolean | `@${string}`,
	phone?:boolean | `@${string}`,
	sid?:boolean | `@${string}`,
	zip_code?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Ordering options when selecting data from "staff_list". */
["staff_list_order_by"]: {
	address?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	city?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	country?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	id?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	name?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	phone?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	sid?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	zip_code?: ValueTypes["order_by"] | undefined | null | Variable<any, string>
};
	/** select columns of table "staff_list" */
["staff_list_select_column"]:staff_list_select_column;
	/** aggregate stddev on columns */
["staff_list_stddev_fields"]: AliasType<{
	id?:boolean | `@${string}`,
	sid?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_pop on columns */
["staff_list_stddev_pop_fields"]: AliasType<{
	id?:boolean | `@${string}`,
	sid?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_samp on columns */
["staff_list_stddev_samp_fields"]: AliasType<{
	id?:boolean | `@${string}`,
	sid?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Streaming cursor of the table "staff_list" */
["staff_list_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ValueTypes["staff_list_stream_cursor_value_input"] | Variable<any, string>,
	/** cursor ordering */
	ordering?: ValueTypes["cursor_ordering"] | undefined | null | Variable<any, string>
};
	/** Initial value of the column from where the streaming should start */
["staff_list_stream_cursor_value_input"]: {
	address?: string | undefined | null | Variable<any, string>,
	city?: string | undefined | null | Variable<any, string>,
	country?: string | undefined | null | Variable<any, string>,
	id?: number | undefined | null | Variable<any, string>,
	name?: string | undefined | null | Variable<any, string>,
	phone?: string | undefined | null | Variable<any, string>,
	sid?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	zip_code?: string | undefined | null | Variable<any, string>
};
	/** aggregate sum on columns */
["staff_list_sum_fields"]: AliasType<{
	id?:boolean | `@${string}`,
	sid?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_pop on columns */
["staff_list_var_pop_fields"]: AliasType<{
	id?:boolean | `@${string}`,
	sid?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_samp on columns */
["staff_list_var_samp_fields"]: AliasType<{
	id?:boolean | `@${string}`,
	sid?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate variance on columns */
["staff_list_variance_fields"]: AliasType<{
	id?:boolean | `@${string}`,
	sid?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate max on columns */
["staff_max_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	email?:boolean | `@${string}`,
	first_name?:boolean | `@${string}`,
	last_name?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
	password?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
	username?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate min on columns */
["staff_min_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	email?:boolean | `@${string}`,
	first_name?:boolean | `@${string}`,
	last_name?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
	password?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
	username?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** response of any mutation on the table "staff" */
["staff_mutation_response"]: AliasType<{
	/** number of rows affected by the mutation */
	affected_rows?:boolean | `@${string}`,
	/** data from the rows affected by the mutation */
	returning?:ValueTypes["staff"],
		__typename?: boolean | `@${string}`
}>;
	/** on_conflict condition type for table "staff" */
["staff_on_conflict"]: {
	constraint: ValueTypes["staff_constraint"] | Variable<any, string>,
	update_columns: Array<ValueTypes["staff_update_column"]> | Variable<any, string>,
	where?: ValueTypes["staff_bool_exp"] | undefined | null | Variable<any, string>
};
	/** Ordering options when selecting data from "staff". */
["staff_order_by"]: {
	active?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	address_id?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	email?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	first_name?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	last_name?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	password?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	picture?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	staff_id?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	store_id?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	username?: ValueTypes["order_by"] | undefined | null | Variable<any, string>
};
	/** primary key columns input for table: staff */
["staff_pk_columns_input"]: {
	staff_id: number | Variable<any, string>
};
	/** select columns of table "staff" */
["staff_select_column"]:staff_select_column;
	/** input type for updating data in table "staff" */
["staff_set_input"]: {
	active?: boolean | undefined | null | Variable<any, string>,
	address_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	email?: string | undefined | null | Variable<any, string>,
	first_name?: string | undefined | null | Variable<any, string>,
	last_name?: string | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>,
	password?: string | undefined | null | Variable<any, string>,
	picture?: ValueTypes["bytea"] | undefined | null | Variable<any, string>,
	staff_id?: number | undefined | null | Variable<any, string>,
	store_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	username?: string | undefined | null | Variable<any, string>
};
	/** aggregate stddev on columns */
["staff_stddev_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_pop on columns */
["staff_stddev_pop_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_samp on columns */
["staff_stddev_samp_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Streaming cursor of the table "staff" */
["staff_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ValueTypes["staff_stream_cursor_value_input"] | Variable<any, string>,
	/** cursor ordering */
	ordering?: ValueTypes["cursor_ordering"] | undefined | null | Variable<any, string>
};
	/** Initial value of the column from where the streaming should start */
["staff_stream_cursor_value_input"]: {
	active?: boolean | undefined | null | Variable<any, string>,
	address_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	email?: string | undefined | null | Variable<any, string>,
	first_name?: string | undefined | null | Variable<any, string>,
	last_name?: string | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>,
	password?: string | undefined | null | Variable<any, string>,
	picture?: ValueTypes["bytea"] | undefined | null | Variable<any, string>,
	staff_id?: number | undefined | null | Variable<any, string>,
	store_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	username?: string | undefined | null | Variable<any, string>
};
	/** aggregate sum on columns */
["staff_sum_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** update columns of table "staff" */
["staff_update_column"]:staff_update_column;
	["staff_updates"]: {
	/** increments the numeric columns with given value of the filtered values */
	_inc?: ValueTypes["staff_inc_input"] | undefined | null | Variable<any, string>,
	/** sets the columns of the filtered rows to the given values */
	_set?: ValueTypes["staff_set_input"] | undefined | null | Variable<any, string>,
	/** filter the rows which have to be updated */
	where: ValueTypes["staff_bool_exp"] | Variable<any, string>
};
	/** aggregate var_pop on columns */
["staff_var_pop_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_samp on columns */
["staff_var_samp_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate variance on columns */
["staff_variance_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** columns and relationships of "store" */
["store"]: AliasType<{
	address_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
	manager_staff_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregated selection of "store" */
["store_aggregate"]: AliasType<{
	aggregate?:ValueTypes["store_aggregate_fields"],
	nodes?:ValueTypes["store"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate fields of "store" */
["store_aggregate_fields"]: AliasType<{
	avg?:ValueTypes["store_avg_fields"],
count?: [{	columns?: Array<ValueTypes["store_select_column"]> | undefined | null | Variable<any, string>,	distinct?: boolean | undefined | null | Variable<any, string>},boolean | `@${string}`],
	max?:ValueTypes["store_max_fields"],
	min?:ValueTypes["store_min_fields"],
	stddev?:ValueTypes["store_stddev_fields"],
	stddev_pop?:ValueTypes["store_stddev_pop_fields"],
	stddev_samp?:ValueTypes["store_stddev_samp_fields"],
	sum?:ValueTypes["store_sum_fields"],
	var_pop?:ValueTypes["store_var_pop_fields"],
	var_samp?:ValueTypes["store_var_samp_fields"],
	variance?:ValueTypes["store_variance_fields"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate avg on columns */
["store_avg_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	manager_staff_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Boolean expression to filter rows from the table "store". All fields are combined with a logical 'AND'. */
["store_bool_exp"]: {
	_and?: Array<ValueTypes["store_bool_exp"]> | undefined | null | Variable<any, string>,
	_not?: ValueTypes["store_bool_exp"] | undefined | null | Variable<any, string>,
	_or?: Array<ValueTypes["store_bool_exp"]> | undefined | null | Variable<any, string>,
	address_id?: ValueTypes["smallint_comparison_exp"] | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp_comparison_exp"] | undefined | null | Variable<any, string>,
	manager_staff_id?: ValueTypes["smallint_comparison_exp"] | undefined | null | Variable<any, string>,
	store_id?: ValueTypes["Int_comparison_exp"] | undefined | null | Variable<any, string>
};
	/** unique or primary key constraints on table "store" */
["store_constraint"]:store_constraint;
	/** input type for incrementing numeric columns in table "store" */
["store_inc_input"]: {
	address_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	manager_staff_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	store_id?: number | undefined | null | Variable<any, string>
};
	/** input type for inserting data into table "store" */
["store_insert_input"]: {
	address_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>,
	manager_staff_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	store_id?: number | undefined | null | Variable<any, string>
};
	/** aggregate max on columns */
["store_max_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
	manager_staff_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate min on columns */
["store_min_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
	manager_staff_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** response of any mutation on the table "store" */
["store_mutation_response"]: AliasType<{
	/** number of rows affected by the mutation */
	affected_rows?:boolean | `@${string}`,
	/** data from the rows affected by the mutation */
	returning?:ValueTypes["store"],
		__typename?: boolean | `@${string}`
}>;
	/** on_conflict condition type for table "store" */
["store_on_conflict"]: {
	constraint: ValueTypes["store_constraint"] | Variable<any, string>,
	update_columns: Array<ValueTypes["store_update_column"]> | Variable<any, string>,
	where?: ValueTypes["store_bool_exp"] | undefined | null | Variable<any, string>
};
	/** Ordering options when selecting data from "store". */
["store_order_by"]: {
	address_id?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	manager_staff_id?: ValueTypes["order_by"] | undefined | null | Variable<any, string>,
	store_id?: ValueTypes["order_by"] | undefined | null | Variable<any, string>
};
	/** primary key columns input for table: store */
["store_pk_columns_input"]: {
	store_id: number | Variable<any, string>
};
	/** select columns of table "store" */
["store_select_column"]:store_select_column;
	/** input type for updating data in table "store" */
["store_set_input"]: {
	address_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>,
	manager_staff_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	store_id?: number | undefined | null | Variable<any, string>
};
	/** aggregate stddev on columns */
["store_stddev_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	manager_staff_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_pop on columns */
["store_stddev_pop_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	manager_staff_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_samp on columns */
["store_stddev_samp_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	manager_staff_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Streaming cursor of the table "store" */
["store_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ValueTypes["store_stream_cursor_value_input"] | Variable<any, string>,
	/** cursor ordering */
	ordering?: ValueTypes["cursor_ordering"] | undefined | null | Variable<any, string>
};
	/** Initial value of the column from where the streaming should start */
["store_stream_cursor_value_input"]: {
	address_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	last_update?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>,
	manager_staff_id?: ValueTypes["smallint"] | undefined | null | Variable<any, string>,
	store_id?: number | undefined | null | Variable<any, string>
};
	/** aggregate sum on columns */
["store_sum_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	manager_staff_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** update columns of table "store" */
["store_update_column"]:store_update_column;
	["store_updates"]: {
	/** increments the numeric columns with given value of the filtered values */
	_inc?: ValueTypes["store_inc_input"] | undefined | null | Variable<any, string>,
	/** sets the columns of the filtered rows to the given values */
	_set?: ValueTypes["store_set_input"] | undefined | null | Variable<any, string>,
	/** filter the rows which have to be updated */
	where: ValueTypes["store_bool_exp"] | Variable<any, string>
};
	/** aggregate var_pop on columns */
["store_var_pop_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	manager_staff_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_samp on columns */
["store_var_samp_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	manager_staff_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate variance on columns */
["store_variance_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	manager_staff_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	["subscription_root"]: AliasType<{
actor?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["actor_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["actor_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["actor_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["actor"]],
actor_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["actor_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["actor_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["actor_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["actor_aggregate"]],
actor_by_pk?: [{	actor_id: number | Variable<any, string>},ValueTypes["actor"]],
actor_info?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["actor_info_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["actor_info_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["actor_info_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["actor_info"]],
actor_info_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["actor_info_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["actor_info_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["actor_info_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["actor_info_aggregate"]],
actor_info_stream?: [{	/** maximum number of rows returned in a single batch */
	batch_size: number | Variable<any, string>,	/** cursor to stream the results returned by the query */
	cursor: Array<ValueTypes["actor_info_stream_cursor_input"] | undefined | null> | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["actor_info_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["actor_info"]],
actor_stream?: [{	/** maximum number of rows returned in a single batch */
	batch_size: number | Variable<any, string>,	/** cursor to stream the results returned by the query */
	cursor: Array<ValueTypes["actor_stream_cursor_input"] | undefined | null> | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["actor_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["actor"]],
address?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["address_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["address_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["address_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["address"]],
address_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["address_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["address_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["address_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["address_aggregate"]],
address_by_pk?: [{	address_id: number | Variable<any, string>},ValueTypes["address"]],
address_stream?: [{	/** maximum number of rows returned in a single batch */
	batch_size: number | Variable<any, string>,	/** cursor to stream the results returned by the query */
	cursor: Array<ValueTypes["address_stream_cursor_input"] | undefined | null> | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["address_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["address"]],
category?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["category_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["category_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["category_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["category"]],
category_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["category_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["category_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["category_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["category_aggregate"]],
category_by_pk?: [{	category_id: number | Variable<any, string>},ValueTypes["category"]],
category_stream?: [{	/** maximum number of rows returned in a single batch */
	batch_size: number | Variable<any, string>,	/** cursor to stream the results returned by the query */
	cursor: Array<ValueTypes["category_stream_cursor_input"] | undefined | null> | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["category_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["category"]],
city?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["city_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["city_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["city_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["city"]],
city_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["city_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["city_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["city_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["city_aggregate"]],
city_by_pk?: [{	city_id: number | Variable<any, string>},ValueTypes["city"]],
city_stream?: [{	/** maximum number of rows returned in a single batch */
	batch_size: number | Variable<any, string>,	/** cursor to stream the results returned by the query */
	cursor: Array<ValueTypes["city_stream_cursor_input"] | undefined | null> | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["city_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["city"]],
country?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["country_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["country_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["country_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["country"]],
country_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["country_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["country_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["country_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["country_aggregate"]],
country_by_pk?: [{	country_id: number | Variable<any, string>},ValueTypes["country"]],
country_stream?: [{	/** maximum number of rows returned in a single batch */
	batch_size: number | Variable<any, string>,	/** cursor to stream the results returned by the query */
	cursor: Array<ValueTypes["country_stream_cursor_input"] | undefined | null> | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["country_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["country"]],
customer?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["customer_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["customer_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["customer_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["customer"]],
customer_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["customer_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["customer_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["customer_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["customer_aggregate"]],
customer_by_pk?: [{	customer_id: number | Variable<any, string>},ValueTypes["customer"]],
customer_list?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["customer_list_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["customer_list_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["customer_list_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["customer_list"]],
customer_list_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["customer_list_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["customer_list_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["customer_list_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["customer_list_aggregate"]],
customer_list_stream?: [{	/** maximum number of rows returned in a single batch */
	batch_size: number | Variable<any, string>,	/** cursor to stream the results returned by the query */
	cursor: Array<ValueTypes["customer_list_stream_cursor_input"] | undefined | null> | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["customer_list_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["customer_list"]],
customer_stream?: [{	/** maximum number of rows returned in a single batch */
	batch_size: number | Variable<any, string>,	/** cursor to stream the results returned by the query */
	cursor: Array<ValueTypes["customer_stream_cursor_input"] | undefined | null> | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["customer_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["customer"]],
film?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["film_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["film_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["film_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["film"]],
film_actor?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["film_actor_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["film_actor_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["film_actor_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["film_actor"]],
film_actor_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["film_actor_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["film_actor_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["film_actor_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["film_actor_aggregate"]],
film_actor_by_pk?: [{	actor_id: ValueTypes["smallint"] | Variable<any, string>,	film_id: ValueTypes["smallint"] | Variable<any, string>},ValueTypes["film_actor"]],
film_actor_stream?: [{	/** maximum number of rows returned in a single batch */
	batch_size: number | Variable<any, string>,	/** cursor to stream the results returned by the query */
	cursor: Array<ValueTypes["film_actor_stream_cursor_input"] | undefined | null> | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["film_actor_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["film_actor"]],
film_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["film_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["film_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["film_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["film_aggregate"]],
film_by_pk?: [{	film_id: number | Variable<any, string>},ValueTypes["film"]],
film_category?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["film_category_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["film_category_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["film_category_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["film_category"]],
film_category_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["film_category_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["film_category_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["film_category_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["film_category_aggregate"]],
film_category_by_pk?: [{	category_id: ValueTypes["smallint"] | Variable<any, string>,	film_id: ValueTypes["smallint"] | Variable<any, string>},ValueTypes["film_category"]],
film_category_stream?: [{	/** maximum number of rows returned in a single batch */
	batch_size: number | Variable<any, string>,	/** cursor to stream the results returned by the query */
	cursor: Array<ValueTypes["film_category_stream_cursor_input"] | undefined | null> | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["film_category_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["film_category"]],
film_list?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["film_list_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["film_list_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["film_list_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["film_list"]],
film_list_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["film_list_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["film_list_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["film_list_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["film_list_aggregate"]],
film_list_stream?: [{	/** maximum number of rows returned in a single batch */
	batch_size: number | Variable<any, string>,	/** cursor to stream the results returned by the query */
	cursor: Array<ValueTypes["film_list_stream_cursor_input"] | undefined | null> | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["film_list_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["film_list"]],
film_stream?: [{	/** maximum number of rows returned in a single batch */
	batch_size: number | Variable<any, string>,	/** cursor to stream the results returned by the query */
	cursor: Array<ValueTypes["film_stream_cursor_input"] | undefined | null> | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["film_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["film"]],
inventory?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["inventory_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["inventory_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["inventory_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["inventory"]],
inventory_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["inventory_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["inventory_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["inventory_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["inventory_aggregate"]],
inventory_by_pk?: [{	inventory_id: number | Variable<any, string>},ValueTypes["inventory"]],
inventory_stream?: [{	/** maximum number of rows returned in a single batch */
	batch_size: number | Variable<any, string>,	/** cursor to stream the results returned by the query */
	cursor: Array<ValueTypes["inventory_stream_cursor_input"] | undefined | null> | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["inventory_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["inventory"]],
language?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["language_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["language_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["language_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["language"]],
language_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["language_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["language_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["language_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["language_aggregate"]],
language_by_pk?: [{	language_id: number | Variable<any, string>},ValueTypes["language"]],
language_stream?: [{	/** maximum number of rows returned in a single batch */
	batch_size: number | Variable<any, string>,	/** cursor to stream the results returned by the query */
	cursor: Array<ValueTypes["language_stream_cursor_input"] | undefined | null> | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["language_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["language"]],
nicer_but_slower_film_list?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["nicer_but_slower_film_list_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["nicer_but_slower_film_list_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["nicer_but_slower_film_list_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["nicer_but_slower_film_list"]],
nicer_but_slower_film_list_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["nicer_but_slower_film_list_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["nicer_but_slower_film_list_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["nicer_but_slower_film_list_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["nicer_but_slower_film_list_aggregate"]],
nicer_but_slower_film_list_stream?: [{	/** maximum number of rows returned in a single batch */
	batch_size: number | Variable<any, string>,	/** cursor to stream the results returned by the query */
	cursor: Array<ValueTypes["nicer_but_slower_film_list_stream_cursor_input"] | undefined | null> | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["nicer_but_slower_film_list_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["nicer_but_slower_film_list"]],
payment?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["payment_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["payment_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["payment_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["payment"]],
payment_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["payment_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["payment_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["payment_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["payment_aggregate"]],
payment_by_pk?: [{	payment_id: number | Variable<any, string>},ValueTypes["payment"]],
payment_stream?: [{	/** maximum number of rows returned in a single batch */
	batch_size: number | Variable<any, string>,	/** cursor to stream the results returned by the query */
	cursor: Array<ValueTypes["payment_stream_cursor_input"] | undefined | null> | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["payment_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["payment"]],
rental?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["rental_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["rental_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["rental_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["rental"]],
rental_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["rental_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["rental_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["rental_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["rental_aggregate"]],
rental_by_pk?: [{	rental_id: number | Variable<any, string>},ValueTypes["rental"]],
rental_stream?: [{	/** maximum number of rows returned in a single batch */
	batch_size: number | Variable<any, string>,	/** cursor to stream the results returned by the query */
	cursor: Array<ValueTypes["rental_stream_cursor_input"] | undefined | null> | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["rental_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["rental"]],
sales_by_film_category?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["sales_by_film_category_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["sales_by_film_category_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["sales_by_film_category_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["sales_by_film_category"]],
sales_by_film_category_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["sales_by_film_category_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["sales_by_film_category_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["sales_by_film_category_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["sales_by_film_category_aggregate"]],
sales_by_film_category_stream?: [{	/** maximum number of rows returned in a single batch */
	batch_size: number | Variable<any, string>,	/** cursor to stream the results returned by the query */
	cursor: Array<ValueTypes["sales_by_film_category_stream_cursor_input"] | undefined | null> | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["sales_by_film_category_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["sales_by_film_category"]],
sales_by_store?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["sales_by_store_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["sales_by_store_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["sales_by_store_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["sales_by_store"]],
sales_by_store_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["sales_by_store_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["sales_by_store_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["sales_by_store_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["sales_by_store_aggregate"]],
sales_by_store_stream?: [{	/** maximum number of rows returned in a single batch */
	batch_size: number | Variable<any, string>,	/** cursor to stream the results returned by the query */
	cursor: Array<ValueTypes["sales_by_store_stream_cursor_input"] | undefined | null> | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["sales_by_store_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["sales_by_store"]],
staff?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["staff_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["staff_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["staff_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["staff"]],
staff_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["staff_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["staff_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["staff_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["staff_aggregate"]],
staff_by_pk?: [{	staff_id: number | Variable<any, string>},ValueTypes["staff"]],
staff_list?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["staff_list_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["staff_list_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["staff_list_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["staff_list"]],
staff_list_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["staff_list_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["staff_list_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["staff_list_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["staff_list_aggregate"]],
staff_list_stream?: [{	/** maximum number of rows returned in a single batch */
	batch_size: number | Variable<any, string>,	/** cursor to stream the results returned by the query */
	cursor: Array<ValueTypes["staff_list_stream_cursor_input"] | undefined | null> | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["staff_list_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["staff_list"]],
staff_stream?: [{	/** maximum number of rows returned in a single batch */
	batch_size: number | Variable<any, string>,	/** cursor to stream the results returned by the query */
	cursor: Array<ValueTypes["staff_stream_cursor_input"] | undefined | null> | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["staff_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["staff"]],
store?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["store_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["store_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["store_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["store"]],
store_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ValueTypes["store_select_column"]> | undefined | null | Variable<any, string>,	/** limit the number of rows returned */
	limit?: number | undefined | null | Variable<any, string>,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null | Variable<any, string>,	/** sort the rows by one or more columns */
	order_by?: Array<ValueTypes["store_order_by"]> | undefined | null | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["store_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["store_aggregate"]],
store_by_pk?: [{	store_id: number | Variable<any, string>},ValueTypes["store"]],
store_stream?: [{	/** maximum number of rows returned in a single batch */
	batch_size: number | Variable<any, string>,	/** cursor to stream the results returned by the query */
	cursor: Array<ValueTypes["store_stream_cursor_input"] | undefined | null> | Variable<any, string>,	/** filter the rows returned */
	where?: ValueTypes["store_bool_exp"] | undefined | null | Variable<any, string>},ValueTypes["store"]],
		__typename?: boolean | `@${string}`
}>;
	["timestamp"]:unknown;
	/** Boolean expression to compare columns of type "timestamp". All fields are combined with logical 'AND'. */
["timestamp_comparison_exp"]: {
	_eq?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>,
	_gt?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>,
	_gte?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>,
	_in?: Array<ValueTypes["timestamp"]> | undefined | null | Variable<any, string>,
	_is_null?: boolean | undefined | null | Variable<any, string>,
	_lt?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>,
	_lte?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>,
	_neq?: ValueTypes["timestamp"] | undefined | null | Variable<any, string>,
	_nin?: Array<ValueTypes["timestamp"]> | undefined | null | Variable<any, string>
};
	["tsvector"]:unknown;
	/** Boolean expression to compare columns of type "tsvector". All fields are combined with logical 'AND'. */
["tsvector_comparison_exp"]: {
	_eq?: ValueTypes["tsvector"] | undefined | null | Variable<any, string>,
	_gt?: ValueTypes["tsvector"] | undefined | null | Variable<any, string>,
	_gte?: ValueTypes["tsvector"] | undefined | null | Variable<any, string>,
	_in?: Array<ValueTypes["tsvector"]> | undefined | null | Variable<any, string>,
	_is_null?: boolean | undefined | null | Variable<any, string>,
	_lt?: ValueTypes["tsvector"] | undefined | null | Variable<any, string>,
	_lte?: ValueTypes["tsvector"] | undefined | null | Variable<any, string>,
	_neq?: ValueTypes["tsvector"] | undefined | null | Variable<any, string>,
	_nin?: Array<ValueTypes["tsvector"]> | undefined | null | Variable<any, string>
}
  }

export type ResolverInputTypes = {
    ["schema"]: AliasType<{
	query?:ResolverInputTypes["query_root"],
	mutation?:ResolverInputTypes["mutation_root"],
	subscription?:ResolverInputTypes["subscription_root"],
		__typename?: boolean | `@${string}`
}>;
	/** Boolean expression to compare columns of type "Boolean". All fields are combined with logical 'AND'. */
["Boolean_comparison_exp"]: {
	_eq?: boolean | undefined | null,
	_gt?: boolean | undefined | null,
	_gte?: boolean | undefined | null,
	_in?: Array<boolean> | undefined | null,
	_is_null?: boolean | undefined | null,
	_lt?: boolean | undefined | null,
	_lte?: boolean | undefined | null,
	_neq?: boolean | undefined | null,
	_nin?: Array<boolean> | undefined | null
};
	/** Boolean expression to compare columns of type "Int". All fields are combined with logical 'AND'. */
["Int_comparison_exp"]: {
	_eq?: number | undefined | null,
	_gt?: number | undefined | null,
	_gte?: number | undefined | null,
	_in?: Array<number> | undefined | null,
	_is_null?: boolean | undefined | null,
	_lt?: number | undefined | null,
	_lte?: number | undefined | null,
	_neq?: number | undefined | null,
	_nin?: Array<number> | undefined | null
};
	/** Boolean expression to compare columns of type "String". All fields are combined with logical 'AND'. */
["String_comparison_exp"]: {
	_eq?: string | undefined | null,
	_gt?: string | undefined | null,
	_gte?: string | undefined | null,
	/** does the column match the given case-insensitive pattern */
	_ilike?: string | undefined | null,
	_in?: Array<string> | undefined | null,
	/** does the column match the given POSIX regular expression, case insensitive */
	_iregex?: string | undefined | null,
	_is_null?: boolean | undefined | null,
	/** does the column match the given pattern */
	_like?: string | undefined | null,
	_lt?: string | undefined | null,
	_lte?: string | undefined | null,
	_neq?: string | undefined | null,
	/** does the column NOT match the given case-insensitive pattern */
	_nilike?: string | undefined | null,
	_nin?: Array<string> | undefined | null,
	/** does the column NOT match the given POSIX regular expression, case insensitive */
	_niregex?: string | undefined | null,
	/** does the column NOT match the given pattern */
	_nlike?: string | undefined | null,
	/** does the column NOT match the given POSIX regular expression, case sensitive */
	_nregex?: string | undefined | null,
	/** does the column NOT match the given SQL regular expression */
	_nsimilar?: string | undefined | null,
	/** does the column match the given POSIX regular expression, case sensitive */
	_regex?: string | undefined | null,
	/** does the column match the given SQL regular expression */
	_similar?: string | undefined | null
};
	["_text"]:unknown;
	/** Boolean expression to compare columns of type "_text". All fields are combined with logical 'AND'. */
["_text_comparison_exp"]: {
	_eq?: ResolverInputTypes["_text"] | undefined | null,
	_gt?: ResolverInputTypes["_text"] | undefined | null,
	_gte?: ResolverInputTypes["_text"] | undefined | null,
	_in?: Array<ResolverInputTypes["_text"]> | undefined | null,
	_is_null?: boolean | undefined | null,
	_lt?: ResolverInputTypes["_text"] | undefined | null,
	_lte?: ResolverInputTypes["_text"] | undefined | null,
	_neq?: ResolverInputTypes["_text"] | undefined | null,
	_nin?: Array<ResolverInputTypes["_text"]> | undefined | null
};
	/** columns and relationships of "actor" */
["actor"]: AliasType<{
	actor_id?:boolean | `@${string}`,
	first_name?:boolean | `@${string}`,
	last_name?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregated selection of "actor" */
["actor_aggregate"]: AliasType<{
	aggregate?:ResolverInputTypes["actor_aggregate_fields"],
	nodes?:ResolverInputTypes["actor"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate fields of "actor" */
["actor_aggregate_fields"]: AliasType<{
	avg?:ResolverInputTypes["actor_avg_fields"],
count?: [{	columns?: Array<ResolverInputTypes["actor_select_column"]> | undefined | null,	distinct?: boolean | undefined | null},boolean | `@${string}`],
	max?:ResolverInputTypes["actor_max_fields"],
	min?:ResolverInputTypes["actor_min_fields"],
	stddev?:ResolverInputTypes["actor_stddev_fields"],
	stddev_pop?:ResolverInputTypes["actor_stddev_pop_fields"],
	stddev_samp?:ResolverInputTypes["actor_stddev_samp_fields"],
	sum?:ResolverInputTypes["actor_sum_fields"],
	var_pop?:ResolverInputTypes["actor_var_pop_fields"],
	var_samp?:ResolverInputTypes["actor_var_samp_fields"],
	variance?:ResolverInputTypes["actor_variance_fields"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate avg on columns */
["actor_avg_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Boolean expression to filter rows from the table "actor". All fields are combined with a logical 'AND'. */
["actor_bool_exp"]: {
	_and?: Array<ResolverInputTypes["actor_bool_exp"]> | undefined | null,
	_not?: ResolverInputTypes["actor_bool_exp"] | undefined | null,
	_or?: Array<ResolverInputTypes["actor_bool_exp"]> | undefined | null,
	actor_id?: ResolverInputTypes["Int_comparison_exp"] | undefined | null,
	first_name?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
	last_name?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
	last_update?: ResolverInputTypes["timestamp_comparison_exp"] | undefined | null
};
	/** unique or primary key constraints on table "actor" */
["actor_constraint"]:actor_constraint;
	/** input type for incrementing numeric columns in table "actor" */
["actor_inc_input"]: {
	actor_id?: number | undefined | null
};
	/** columns and relationships of "actor_info" */
["actor_info"]: AliasType<{
	actor_id?:boolean | `@${string}`,
	film_info?:boolean | `@${string}`,
	first_name?:boolean | `@${string}`,
	last_name?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregated selection of "actor_info" */
["actor_info_aggregate"]: AliasType<{
	aggregate?:ResolverInputTypes["actor_info_aggregate_fields"],
	nodes?:ResolverInputTypes["actor_info"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate fields of "actor_info" */
["actor_info_aggregate_fields"]: AliasType<{
	avg?:ResolverInputTypes["actor_info_avg_fields"],
count?: [{	columns?: Array<ResolverInputTypes["actor_info_select_column"]> | undefined | null,	distinct?: boolean | undefined | null},boolean | `@${string}`],
	max?:ResolverInputTypes["actor_info_max_fields"],
	min?:ResolverInputTypes["actor_info_min_fields"],
	stddev?:ResolverInputTypes["actor_info_stddev_fields"],
	stddev_pop?:ResolverInputTypes["actor_info_stddev_pop_fields"],
	stddev_samp?:ResolverInputTypes["actor_info_stddev_samp_fields"],
	sum?:ResolverInputTypes["actor_info_sum_fields"],
	var_pop?:ResolverInputTypes["actor_info_var_pop_fields"],
	var_samp?:ResolverInputTypes["actor_info_var_samp_fields"],
	variance?:ResolverInputTypes["actor_info_variance_fields"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate avg on columns */
["actor_info_avg_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Boolean expression to filter rows from the table "actor_info". All fields are combined with a logical 'AND'. */
["actor_info_bool_exp"]: {
	_and?: Array<ResolverInputTypes["actor_info_bool_exp"]> | undefined | null,
	_not?: ResolverInputTypes["actor_info_bool_exp"] | undefined | null,
	_or?: Array<ResolverInputTypes["actor_info_bool_exp"]> | undefined | null,
	actor_id?: ResolverInputTypes["Int_comparison_exp"] | undefined | null,
	film_info?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
	first_name?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
	last_name?: ResolverInputTypes["String_comparison_exp"] | undefined | null
};
	/** aggregate max on columns */
["actor_info_max_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
	film_info?:boolean | `@${string}`,
	first_name?:boolean | `@${string}`,
	last_name?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate min on columns */
["actor_info_min_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
	film_info?:boolean | `@${string}`,
	first_name?:boolean | `@${string}`,
	last_name?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Ordering options when selecting data from "actor_info". */
["actor_info_order_by"]: {
	actor_id?: ResolverInputTypes["order_by"] | undefined | null,
	film_info?: ResolverInputTypes["order_by"] | undefined | null,
	first_name?: ResolverInputTypes["order_by"] | undefined | null,
	last_name?: ResolverInputTypes["order_by"] | undefined | null
};
	/** select columns of table "actor_info" */
["actor_info_select_column"]:actor_info_select_column;
	/** aggregate stddev on columns */
["actor_info_stddev_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_pop on columns */
["actor_info_stddev_pop_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_samp on columns */
["actor_info_stddev_samp_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Streaming cursor of the table "actor_info" */
["actor_info_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ResolverInputTypes["actor_info_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: ResolverInputTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["actor_info_stream_cursor_value_input"]: {
	actor_id?: number | undefined | null,
	film_info?: string | undefined | null,
	first_name?: string | undefined | null,
	last_name?: string | undefined | null
};
	/** aggregate sum on columns */
["actor_info_sum_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_pop on columns */
["actor_info_var_pop_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_samp on columns */
["actor_info_var_samp_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate variance on columns */
["actor_info_variance_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** input type for inserting data into table "actor" */
["actor_insert_input"]: {
	actor_id?: number | undefined | null,
	first_name?: string | undefined | null,
	last_name?: string | undefined | null,
	last_update?: ResolverInputTypes["timestamp"] | undefined | null
};
	/** aggregate max on columns */
["actor_max_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
	first_name?:boolean | `@${string}`,
	last_name?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate min on columns */
["actor_min_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
	first_name?:boolean | `@${string}`,
	last_name?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** response of any mutation on the table "actor" */
["actor_mutation_response"]: AliasType<{
	/** number of rows affected by the mutation */
	affected_rows?:boolean | `@${string}`,
	/** data from the rows affected by the mutation */
	returning?:ResolverInputTypes["actor"],
		__typename?: boolean | `@${string}`
}>;
	/** on_conflict condition type for table "actor" */
["actor_on_conflict"]: {
	constraint: ResolverInputTypes["actor_constraint"],
	update_columns: Array<ResolverInputTypes["actor_update_column"]>,
	where?: ResolverInputTypes["actor_bool_exp"] | undefined | null
};
	/** Ordering options when selecting data from "actor". */
["actor_order_by"]: {
	actor_id?: ResolverInputTypes["order_by"] | undefined | null,
	first_name?: ResolverInputTypes["order_by"] | undefined | null,
	last_name?: ResolverInputTypes["order_by"] | undefined | null,
	last_update?: ResolverInputTypes["order_by"] | undefined | null
};
	/** primary key columns input for table: actor */
["actor_pk_columns_input"]: {
	actor_id: number
};
	/** select columns of table "actor" */
["actor_select_column"]:actor_select_column;
	/** input type for updating data in table "actor" */
["actor_set_input"]: {
	actor_id?: number | undefined | null,
	first_name?: string | undefined | null,
	last_name?: string | undefined | null,
	last_update?: ResolverInputTypes["timestamp"] | undefined | null
};
	/** aggregate stddev on columns */
["actor_stddev_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_pop on columns */
["actor_stddev_pop_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_samp on columns */
["actor_stddev_samp_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Streaming cursor of the table "actor" */
["actor_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ResolverInputTypes["actor_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: ResolverInputTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["actor_stream_cursor_value_input"]: {
	actor_id?: number | undefined | null,
	first_name?: string | undefined | null,
	last_name?: string | undefined | null,
	last_update?: ResolverInputTypes["timestamp"] | undefined | null
};
	/** aggregate sum on columns */
["actor_sum_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** update columns of table "actor" */
["actor_update_column"]:actor_update_column;
	["actor_updates"]: {
	/** increments the numeric columns with given value of the filtered values */
	_inc?: ResolverInputTypes["actor_inc_input"] | undefined | null,
	/** sets the columns of the filtered rows to the given values */
	_set?: ResolverInputTypes["actor_set_input"] | undefined | null,
	/** filter the rows which have to be updated */
	where: ResolverInputTypes["actor_bool_exp"]
};
	/** aggregate var_pop on columns */
["actor_var_pop_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_samp on columns */
["actor_var_samp_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate variance on columns */
["actor_variance_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** columns and relationships of "address" */
["address"]: AliasType<{
	address?:boolean | `@${string}`,
	address2?:boolean | `@${string}`,
	address_id?:boolean | `@${string}`,
	city_id?:boolean | `@${string}`,
	district?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
	phone?:boolean | `@${string}`,
	postal_code?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregated selection of "address" */
["address_aggregate"]: AliasType<{
	aggregate?:ResolverInputTypes["address_aggregate_fields"],
	nodes?:ResolverInputTypes["address"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate fields of "address" */
["address_aggregate_fields"]: AliasType<{
	avg?:ResolverInputTypes["address_avg_fields"],
count?: [{	columns?: Array<ResolverInputTypes["address_select_column"]> | undefined | null,	distinct?: boolean | undefined | null},boolean | `@${string}`],
	max?:ResolverInputTypes["address_max_fields"],
	min?:ResolverInputTypes["address_min_fields"],
	stddev?:ResolverInputTypes["address_stddev_fields"],
	stddev_pop?:ResolverInputTypes["address_stddev_pop_fields"],
	stddev_samp?:ResolverInputTypes["address_stddev_samp_fields"],
	sum?:ResolverInputTypes["address_sum_fields"],
	var_pop?:ResolverInputTypes["address_var_pop_fields"],
	var_samp?:ResolverInputTypes["address_var_samp_fields"],
	variance?:ResolverInputTypes["address_variance_fields"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate avg on columns */
["address_avg_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	city_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Boolean expression to filter rows from the table "address". All fields are combined with a logical 'AND'. */
["address_bool_exp"]: {
	_and?: Array<ResolverInputTypes["address_bool_exp"]> | undefined | null,
	_not?: ResolverInputTypes["address_bool_exp"] | undefined | null,
	_or?: Array<ResolverInputTypes["address_bool_exp"]> | undefined | null,
	address?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
	address2?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
	address_id?: ResolverInputTypes["Int_comparison_exp"] | undefined | null,
	city_id?: ResolverInputTypes["smallint_comparison_exp"] | undefined | null,
	district?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
	last_update?: ResolverInputTypes["timestamp_comparison_exp"] | undefined | null,
	phone?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
	postal_code?: ResolverInputTypes["String_comparison_exp"] | undefined | null
};
	/** unique or primary key constraints on table "address" */
["address_constraint"]:address_constraint;
	/** input type for incrementing numeric columns in table "address" */
["address_inc_input"]: {
	address_id?: number | undefined | null,
	city_id?: ResolverInputTypes["smallint"] | undefined | null
};
	/** input type for inserting data into table "address" */
["address_insert_input"]: {
	address?: string | undefined | null,
	address2?: string | undefined | null,
	address_id?: number | undefined | null,
	city_id?: ResolverInputTypes["smallint"] | undefined | null,
	district?: string | undefined | null,
	last_update?: ResolverInputTypes["timestamp"] | undefined | null,
	phone?: string | undefined | null,
	postal_code?: string | undefined | null
};
	/** aggregate max on columns */
["address_max_fields"]: AliasType<{
	address?:boolean | `@${string}`,
	address2?:boolean | `@${string}`,
	address_id?:boolean | `@${string}`,
	city_id?:boolean | `@${string}`,
	district?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
	phone?:boolean | `@${string}`,
	postal_code?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate min on columns */
["address_min_fields"]: AliasType<{
	address?:boolean | `@${string}`,
	address2?:boolean | `@${string}`,
	address_id?:boolean | `@${string}`,
	city_id?:boolean | `@${string}`,
	district?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
	phone?:boolean | `@${string}`,
	postal_code?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** response of any mutation on the table "address" */
["address_mutation_response"]: AliasType<{
	/** number of rows affected by the mutation */
	affected_rows?:boolean | `@${string}`,
	/** data from the rows affected by the mutation */
	returning?:ResolverInputTypes["address"],
		__typename?: boolean | `@${string}`
}>;
	/** on_conflict condition type for table "address" */
["address_on_conflict"]: {
	constraint: ResolverInputTypes["address_constraint"],
	update_columns: Array<ResolverInputTypes["address_update_column"]>,
	where?: ResolverInputTypes["address_bool_exp"] | undefined | null
};
	/** Ordering options when selecting data from "address". */
["address_order_by"]: {
	address?: ResolverInputTypes["order_by"] | undefined | null,
	address2?: ResolverInputTypes["order_by"] | undefined | null,
	address_id?: ResolverInputTypes["order_by"] | undefined | null,
	city_id?: ResolverInputTypes["order_by"] | undefined | null,
	district?: ResolverInputTypes["order_by"] | undefined | null,
	last_update?: ResolverInputTypes["order_by"] | undefined | null,
	phone?: ResolverInputTypes["order_by"] | undefined | null,
	postal_code?: ResolverInputTypes["order_by"] | undefined | null
};
	/** primary key columns input for table: address */
["address_pk_columns_input"]: {
	address_id: number
};
	/** select columns of table "address" */
["address_select_column"]:address_select_column;
	/** input type for updating data in table "address" */
["address_set_input"]: {
	address?: string | undefined | null,
	address2?: string | undefined | null,
	address_id?: number | undefined | null,
	city_id?: ResolverInputTypes["smallint"] | undefined | null,
	district?: string | undefined | null,
	last_update?: ResolverInputTypes["timestamp"] | undefined | null,
	phone?: string | undefined | null,
	postal_code?: string | undefined | null
};
	/** aggregate stddev on columns */
["address_stddev_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	city_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_pop on columns */
["address_stddev_pop_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	city_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_samp on columns */
["address_stddev_samp_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	city_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Streaming cursor of the table "address" */
["address_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ResolverInputTypes["address_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: ResolverInputTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["address_stream_cursor_value_input"]: {
	address?: string | undefined | null,
	address2?: string | undefined | null,
	address_id?: number | undefined | null,
	city_id?: ResolverInputTypes["smallint"] | undefined | null,
	district?: string | undefined | null,
	last_update?: ResolverInputTypes["timestamp"] | undefined | null,
	phone?: string | undefined | null,
	postal_code?: string | undefined | null
};
	/** aggregate sum on columns */
["address_sum_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	city_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** update columns of table "address" */
["address_update_column"]:address_update_column;
	["address_updates"]: {
	/** increments the numeric columns with given value of the filtered values */
	_inc?: ResolverInputTypes["address_inc_input"] | undefined | null,
	/** sets the columns of the filtered rows to the given values */
	_set?: ResolverInputTypes["address_set_input"] | undefined | null,
	/** filter the rows which have to be updated */
	where: ResolverInputTypes["address_bool_exp"]
};
	/** aggregate var_pop on columns */
["address_var_pop_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	city_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_samp on columns */
["address_var_samp_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	city_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate variance on columns */
["address_variance_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	city_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	["bpchar"]:unknown;
	/** Boolean expression to compare columns of type "bpchar". All fields are combined with logical 'AND'. */
["bpchar_comparison_exp"]: {
	_eq?: ResolverInputTypes["bpchar"] | undefined | null,
	_gt?: ResolverInputTypes["bpchar"] | undefined | null,
	_gte?: ResolverInputTypes["bpchar"] | undefined | null,
	/** does the column match the given case-insensitive pattern */
	_ilike?: ResolverInputTypes["bpchar"] | undefined | null,
	_in?: Array<ResolverInputTypes["bpchar"]> | undefined | null,
	/** does the column match the given POSIX regular expression, case insensitive */
	_iregex?: ResolverInputTypes["bpchar"] | undefined | null,
	_is_null?: boolean | undefined | null,
	/** does the column match the given pattern */
	_like?: ResolverInputTypes["bpchar"] | undefined | null,
	_lt?: ResolverInputTypes["bpchar"] | undefined | null,
	_lte?: ResolverInputTypes["bpchar"] | undefined | null,
	_neq?: ResolverInputTypes["bpchar"] | undefined | null,
	/** does the column NOT match the given case-insensitive pattern */
	_nilike?: ResolverInputTypes["bpchar"] | undefined | null,
	_nin?: Array<ResolverInputTypes["bpchar"]> | undefined | null,
	/** does the column NOT match the given POSIX regular expression, case insensitive */
	_niregex?: ResolverInputTypes["bpchar"] | undefined | null,
	/** does the column NOT match the given pattern */
	_nlike?: ResolverInputTypes["bpchar"] | undefined | null,
	/** does the column NOT match the given POSIX regular expression, case sensitive */
	_nregex?: ResolverInputTypes["bpchar"] | undefined | null,
	/** does the column NOT match the given SQL regular expression */
	_nsimilar?: ResolverInputTypes["bpchar"] | undefined | null,
	/** does the column match the given POSIX regular expression, case sensitive */
	_regex?: ResolverInputTypes["bpchar"] | undefined | null,
	/** does the column match the given SQL regular expression */
	_similar?: ResolverInputTypes["bpchar"] | undefined | null
};
	["bytea"]:unknown;
	/** Boolean expression to compare columns of type "bytea". All fields are combined with logical 'AND'. */
["bytea_comparison_exp"]: {
	_eq?: ResolverInputTypes["bytea"] | undefined | null,
	_gt?: ResolverInputTypes["bytea"] | undefined | null,
	_gte?: ResolverInputTypes["bytea"] | undefined | null,
	_in?: Array<ResolverInputTypes["bytea"]> | undefined | null,
	_is_null?: boolean | undefined | null,
	_lt?: ResolverInputTypes["bytea"] | undefined | null,
	_lte?: ResolverInputTypes["bytea"] | undefined | null,
	_neq?: ResolverInputTypes["bytea"] | undefined | null,
	_nin?: Array<ResolverInputTypes["bytea"]> | undefined | null
};
	/** columns and relationships of "category" */
["category"]: AliasType<{
	category_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
	name?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregated selection of "category" */
["category_aggregate"]: AliasType<{
	aggregate?:ResolverInputTypes["category_aggregate_fields"],
	nodes?:ResolverInputTypes["category"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate fields of "category" */
["category_aggregate_fields"]: AliasType<{
	avg?:ResolverInputTypes["category_avg_fields"],
count?: [{	columns?: Array<ResolverInputTypes["category_select_column"]> | undefined | null,	distinct?: boolean | undefined | null},boolean | `@${string}`],
	max?:ResolverInputTypes["category_max_fields"],
	min?:ResolverInputTypes["category_min_fields"],
	stddev?:ResolverInputTypes["category_stddev_fields"],
	stddev_pop?:ResolverInputTypes["category_stddev_pop_fields"],
	stddev_samp?:ResolverInputTypes["category_stddev_samp_fields"],
	sum?:ResolverInputTypes["category_sum_fields"],
	var_pop?:ResolverInputTypes["category_var_pop_fields"],
	var_samp?:ResolverInputTypes["category_var_samp_fields"],
	variance?:ResolverInputTypes["category_variance_fields"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate avg on columns */
["category_avg_fields"]: AliasType<{
	category_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Boolean expression to filter rows from the table "category". All fields are combined with a logical 'AND'. */
["category_bool_exp"]: {
	_and?: Array<ResolverInputTypes["category_bool_exp"]> | undefined | null,
	_not?: ResolverInputTypes["category_bool_exp"] | undefined | null,
	_or?: Array<ResolverInputTypes["category_bool_exp"]> | undefined | null,
	category_id?: ResolverInputTypes["Int_comparison_exp"] | undefined | null,
	last_update?: ResolverInputTypes["timestamp_comparison_exp"] | undefined | null,
	name?: ResolverInputTypes["String_comparison_exp"] | undefined | null
};
	/** unique or primary key constraints on table "category" */
["category_constraint"]:category_constraint;
	/** input type for incrementing numeric columns in table "category" */
["category_inc_input"]: {
	category_id?: number | undefined | null
};
	/** input type for inserting data into table "category" */
["category_insert_input"]: {
	category_id?: number | undefined | null,
	last_update?: ResolverInputTypes["timestamp"] | undefined | null,
	name?: string | undefined | null
};
	/** aggregate max on columns */
["category_max_fields"]: AliasType<{
	category_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
	name?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate min on columns */
["category_min_fields"]: AliasType<{
	category_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
	name?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** response of any mutation on the table "category" */
["category_mutation_response"]: AliasType<{
	/** number of rows affected by the mutation */
	affected_rows?:boolean | `@${string}`,
	/** data from the rows affected by the mutation */
	returning?:ResolverInputTypes["category"],
		__typename?: boolean | `@${string}`
}>;
	/** on_conflict condition type for table "category" */
["category_on_conflict"]: {
	constraint: ResolverInputTypes["category_constraint"],
	update_columns: Array<ResolverInputTypes["category_update_column"]>,
	where?: ResolverInputTypes["category_bool_exp"] | undefined | null
};
	/** Ordering options when selecting data from "category". */
["category_order_by"]: {
	category_id?: ResolverInputTypes["order_by"] | undefined | null,
	last_update?: ResolverInputTypes["order_by"] | undefined | null,
	name?: ResolverInputTypes["order_by"] | undefined | null
};
	/** primary key columns input for table: category */
["category_pk_columns_input"]: {
	category_id: number
};
	/** select columns of table "category" */
["category_select_column"]:category_select_column;
	/** input type for updating data in table "category" */
["category_set_input"]: {
	category_id?: number | undefined | null,
	last_update?: ResolverInputTypes["timestamp"] | undefined | null,
	name?: string | undefined | null
};
	/** aggregate stddev on columns */
["category_stddev_fields"]: AliasType<{
	category_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_pop on columns */
["category_stddev_pop_fields"]: AliasType<{
	category_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_samp on columns */
["category_stddev_samp_fields"]: AliasType<{
	category_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Streaming cursor of the table "category" */
["category_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ResolverInputTypes["category_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: ResolverInputTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["category_stream_cursor_value_input"]: {
	category_id?: number | undefined | null,
	last_update?: ResolverInputTypes["timestamp"] | undefined | null,
	name?: string | undefined | null
};
	/** aggregate sum on columns */
["category_sum_fields"]: AliasType<{
	category_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** update columns of table "category" */
["category_update_column"]:category_update_column;
	["category_updates"]: {
	/** increments the numeric columns with given value of the filtered values */
	_inc?: ResolverInputTypes["category_inc_input"] | undefined | null,
	/** sets the columns of the filtered rows to the given values */
	_set?: ResolverInputTypes["category_set_input"] | undefined | null,
	/** filter the rows which have to be updated */
	where: ResolverInputTypes["category_bool_exp"]
};
	/** aggregate var_pop on columns */
["category_var_pop_fields"]: AliasType<{
	category_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_samp on columns */
["category_var_samp_fields"]: AliasType<{
	category_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate variance on columns */
["category_variance_fields"]: AliasType<{
	category_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** columns and relationships of "city" */
["city"]: AliasType<{
	city?:boolean | `@${string}`,
	city_id?:boolean | `@${string}`,
	country_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregated selection of "city" */
["city_aggregate"]: AliasType<{
	aggregate?:ResolverInputTypes["city_aggregate_fields"],
	nodes?:ResolverInputTypes["city"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate fields of "city" */
["city_aggregate_fields"]: AliasType<{
	avg?:ResolverInputTypes["city_avg_fields"],
count?: [{	columns?: Array<ResolverInputTypes["city_select_column"]> | undefined | null,	distinct?: boolean | undefined | null},boolean | `@${string}`],
	max?:ResolverInputTypes["city_max_fields"],
	min?:ResolverInputTypes["city_min_fields"],
	stddev?:ResolverInputTypes["city_stddev_fields"],
	stddev_pop?:ResolverInputTypes["city_stddev_pop_fields"],
	stddev_samp?:ResolverInputTypes["city_stddev_samp_fields"],
	sum?:ResolverInputTypes["city_sum_fields"],
	var_pop?:ResolverInputTypes["city_var_pop_fields"],
	var_samp?:ResolverInputTypes["city_var_samp_fields"],
	variance?:ResolverInputTypes["city_variance_fields"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate avg on columns */
["city_avg_fields"]: AliasType<{
	city_id?:boolean | `@${string}`,
	country_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Boolean expression to filter rows from the table "city". All fields are combined with a logical 'AND'. */
["city_bool_exp"]: {
	_and?: Array<ResolverInputTypes["city_bool_exp"]> | undefined | null,
	_not?: ResolverInputTypes["city_bool_exp"] | undefined | null,
	_or?: Array<ResolverInputTypes["city_bool_exp"]> | undefined | null,
	city?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
	city_id?: ResolverInputTypes["Int_comparison_exp"] | undefined | null,
	country_id?: ResolverInputTypes["smallint_comparison_exp"] | undefined | null,
	last_update?: ResolverInputTypes["timestamp_comparison_exp"] | undefined | null
};
	/** unique or primary key constraints on table "city" */
["city_constraint"]:city_constraint;
	/** input type for incrementing numeric columns in table "city" */
["city_inc_input"]: {
	city_id?: number | undefined | null,
	country_id?: ResolverInputTypes["smallint"] | undefined | null
};
	/** input type for inserting data into table "city" */
["city_insert_input"]: {
	city?: string | undefined | null,
	city_id?: number | undefined | null,
	country_id?: ResolverInputTypes["smallint"] | undefined | null,
	last_update?: ResolverInputTypes["timestamp"] | undefined | null
};
	/** aggregate max on columns */
["city_max_fields"]: AliasType<{
	city?:boolean | `@${string}`,
	city_id?:boolean | `@${string}`,
	country_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate min on columns */
["city_min_fields"]: AliasType<{
	city?:boolean | `@${string}`,
	city_id?:boolean | `@${string}`,
	country_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** response of any mutation on the table "city" */
["city_mutation_response"]: AliasType<{
	/** number of rows affected by the mutation */
	affected_rows?:boolean | `@${string}`,
	/** data from the rows affected by the mutation */
	returning?:ResolverInputTypes["city"],
		__typename?: boolean | `@${string}`
}>;
	/** on_conflict condition type for table "city" */
["city_on_conflict"]: {
	constraint: ResolverInputTypes["city_constraint"],
	update_columns: Array<ResolverInputTypes["city_update_column"]>,
	where?: ResolverInputTypes["city_bool_exp"] | undefined | null
};
	/** Ordering options when selecting data from "city". */
["city_order_by"]: {
	city?: ResolverInputTypes["order_by"] | undefined | null,
	city_id?: ResolverInputTypes["order_by"] | undefined | null,
	country_id?: ResolverInputTypes["order_by"] | undefined | null,
	last_update?: ResolverInputTypes["order_by"] | undefined | null
};
	/** primary key columns input for table: city */
["city_pk_columns_input"]: {
	city_id: number
};
	/** select columns of table "city" */
["city_select_column"]:city_select_column;
	/** input type for updating data in table "city" */
["city_set_input"]: {
	city?: string | undefined | null,
	city_id?: number | undefined | null,
	country_id?: ResolverInputTypes["smallint"] | undefined | null,
	last_update?: ResolverInputTypes["timestamp"] | undefined | null
};
	/** aggregate stddev on columns */
["city_stddev_fields"]: AliasType<{
	city_id?:boolean | `@${string}`,
	country_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_pop on columns */
["city_stddev_pop_fields"]: AliasType<{
	city_id?:boolean | `@${string}`,
	country_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_samp on columns */
["city_stddev_samp_fields"]: AliasType<{
	city_id?:boolean | `@${string}`,
	country_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Streaming cursor of the table "city" */
["city_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ResolverInputTypes["city_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: ResolverInputTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["city_stream_cursor_value_input"]: {
	city?: string | undefined | null,
	city_id?: number | undefined | null,
	country_id?: ResolverInputTypes["smallint"] | undefined | null,
	last_update?: ResolverInputTypes["timestamp"] | undefined | null
};
	/** aggregate sum on columns */
["city_sum_fields"]: AliasType<{
	city_id?:boolean | `@${string}`,
	country_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** update columns of table "city" */
["city_update_column"]:city_update_column;
	["city_updates"]: {
	/** increments the numeric columns with given value of the filtered values */
	_inc?: ResolverInputTypes["city_inc_input"] | undefined | null,
	/** sets the columns of the filtered rows to the given values */
	_set?: ResolverInputTypes["city_set_input"] | undefined | null,
	/** filter the rows which have to be updated */
	where: ResolverInputTypes["city_bool_exp"]
};
	/** aggregate var_pop on columns */
["city_var_pop_fields"]: AliasType<{
	city_id?:boolean | `@${string}`,
	country_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_samp on columns */
["city_var_samp_fields"]: AliasType<{
	city_id?:boolean | `@${string}`,
	country_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate variance on columns */
["city_variance_fields"]: AliasType<{
	city_id?:boolean | `@${string}`,
	country_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** columns and relationships of "country" */
["country"]: AliasType<{
	country?:boolean | `@${string}`,
	country_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregated selection of "country" */
["country_aggregate"]: AliasType<{
	aggregate?:ResolverInputTypes["country_aggregate_fields"],
	nodes?:ResolverInputTypes["country"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate fields of "country" */
["country_aggregate_fields"]: AliasType<{
	avg?:ResolverInputTypes["country_avg_fields"],
count?: [{	columns?: Array<ResolverInputTypes["country_select_column"]> | undefined | null,	distinct?: boolean | undefined | null},boolean | `@${string}`],
	max?:ResolverInputTypes["country_max_fields"],
	min?:ResolverInputTypes["country_min_fields"],
	stddev?:ResolverInputTypes["country_stddev_fields"],
	stddev_pop?:ResolverInputTypes["country_stddev_pop_fields"],
	stddev_samp?:ResolverInputTypes["country_stddev_samp_fields"],
	sum?:ResolverInputTypes["country_sum_fields"],
	var_pop?:ResolverInputTypes["country_var_pop_fields"],
	var_samp?:ResolverInputTypes["country_var_samp_fields"],
	variance?:ResolverInputTypes["country_variance_fields"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate avg on columns */
["country_avg_fields"]: AliasType<{
	country_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Boolean expression to filter rows from the table "country". All fields are combined with a logical 'AND'. */
["country_bool_exp"]: {
	_and?: Array<ResolverInputTypes["country_bool_exp"]> | undefined | null,
	_not?: ResolverInputTypes["country_bool_exp"] | undefined | null,
	_or?: Array<ResolverInputTypes["country_bool_exp"]> | undefined | null,
	country?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
	country_id?: ResolverInputTypes["Int_comparison_exp"] | undefined | null,
	last_update?: ResolverInputTypes["timestamp_comparison_exp"] | undefined | null
};
	/** unique or primary key constraints on table "country" */
["country_constraint"]:country_constraint;
	/** input type for incrementing numeric columns in table "country" */
["country_inc_input"]: {
	country_id?: number | undefined | null
};
	/** input type for inserting data into table "country" */
["country_insert_input"]: {
	country?: string | undefined | null,
	country_id?: number | undefined | null,
	last_update?: ResolverInputTypes["timestamp"] | undefined | null
};
	/** aggregate max on columns */
["country_max_fields"]: AliasType<{
	country?:boolean | `@${string}`,
	country_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate min on columns */
["country_min_fields"]: AliasType<{
	country?:boolean | `@${string}`,
	country_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** response of any mutation on the table "country" */
["country_mutation_response"]: AliasType<{
	/** number of rows affected by the mutation */
	affected_rows?:boolean | `@${string}`,
	/** data from the rows affected by the mutation */
	returning?:ResolverInputTypes["country"],
		__typename?: boolean | `@${string}`
}>;
	/** on_conflict condition type for table "country" */
["country_on_conflict"]: {
	constraint: ResolverInputTypes["country_constraint"],
	update_columns: Array<ResolverInputTypes["country_update_column"]>,
	where?: ResolverInputTypes["country_bool_exp"] | undefined | null
};
	/** Ordering options when selecting data from "country". */
["country_order_by"]: {
	country?: ResolverInputTypes["order_by"] | undefined | null,
	country_id?: ResolverInputTypes["order_by"] | undefined | null,
	last_update?: ResolverInputTypes["order_by"] | undefined | null
};
	/** primary key columns input for table: country */
["country_pk_columns_input"]: {
	country_id: number
};
	/** select columns of table "country" */
["country_select_column"]:country_select_column;
	/** input type for updating data in table "country" */
["country_set_input"]: {
	country?: string | undefined | null,
	country_id?: number | undefined | null,
	last_update?: ResolverInputTypes["timestamp"] | undefined | null
};
	/** aggregate stddev on columns */
["country_stddev_fields"]: AliasType<{
	country_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_pop on columns */
["country_stddev_pop_fields"]: AliasType<{
	country_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_samp on columns */
["country_stddev_samp_fields"]: AliasType<{
	country_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Streaming cursor of the table "country" */
["country_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ResolverInputTypes["country_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: ResolverInputTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["country_stream_cursor_value_input"]: {
	country?: string | undefined | null,
	country_id?: number | undefined | null,
	last_update?: ResolverInputTypes["timestamp"] | undefined | null
};
	/** aggregate sum on columns */
["country_sum_fields"]: AliasType<{
	country_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** update columns of table "country" */
["country_update_column"]:country_update_column;
	["country_updates"]: {
	/** increments the numeric columns with given value of the filtered values */
	_inc?: ResolverInputTypes["country_inc_input"] | undefined | null,
	/** sets the columns of the filtered rows to the given values */
	_set?: ResolverInputTypes["country_set_input"] | undefined | null,
	/** filter the rows which have to be updated */
	where: ResolverInputTypes["country_bool_exp"]
};
	/** aggregate var_pop on columns */
["country_var_pop_fields"]: AliasType<{
	country_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_samp on columns */
["country_var_samp_fields"]: AliasType<{
	country_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate variance on columns */
["country_variance_fields"]: AliasType<{
	country_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** ordering argument of a cursor */
["cursor_ordering"]:cursor_ordering;
	/** columns and relationships of "customer" */
["customer"]: AliasType<{
	active?:boolean | `@${string}`,
	activebool?:boolean | `@${string}`,
	address_id?:boolean | `@${string}`,
	create_date?:boolean | `@${string}`,
	customer_id?:boolean | `@${string}`,
	email?:boolean | `@${string}`,
	first_name?:boolean | `@${string}`,
	last_name?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregated selection of "customer" */
["customer_aggregate"]: AliasType<{
	aggregate?:ResolverInputTypes["customer_aggregate_fields"],
	nodes?:ResolverInputTypes["customer"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate fields of "customer" */
["customer_aggregate_fields"]: AliasType<{
	avg?:ResolverInputTypes["customer_avg_fields"],
count?: [{	columns?: Array<ResolverInputTypes["customer_select_column"]> | undefined | null,	distinct?: boolean | undefined | null},boolean | `@${string}`],
	max?:ResolverInputTypes["customer_max_fields"],
	min?:ResolverInputTypes["customer_min_fields"],
	stddev?:ResolverInputTypes["customer_stddev_fields"],
	stddev_pop?:ResolverInputTypes["customer_stddev_pop_fields"],
	stddev_samp?:ResolverInputTypes["customer_stddev_samp_fields"],
	sum?:ResolverInputTypes["customer_sum_fields"],
	var_pop?:ResolverInputTypes["customer_var_pop_fields"],
	var_samp?:ResolverInputTypes["customer_var_samp_fields"],
	variance?:ResolverInputTypes["customer_variance_fields"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate avg on columns */
["customer_avg_fields"]: AliasType<{
	active?:boolean | `@${string}`,
	address_id?:boolean | `@${string}`,
	customer_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Boolean expression to filter rows from the table "customer". All fields are combined with a logical 'AND'. */
["customer_bool_exp"]: {
	_and?: Array<ResolverInputTypes["customer_bool_exp"]> | undefined | null,
	_not?: ResolverInputTypes["customer_bool_exp"] | undefined | null,
	_or?: Array<ResolverInputTypes["customer_bool_exp"]> | undefined | null,
	active?: ResolverInputTypes["Int_comparison_exp"] | undefined | null,
	activebool?: ResolverInputTypes["Boolean_comparison_exp"] | undefined | null,
	address_id?: ResolverInputTypes["smallint_comparison_exp"] | undefined | null,
	create_date?: ResolverInputTypes["date_comparison_exp"] | undefined | null,
	customer_id?: ResolverInputTypes["Int_comparison_exp"] | undefined | null,
	email?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
	first_name?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
	last_name?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
	last_update?: ResolverInputTypes["timestamp_comparison_exp"] | undefined | null,
	store_id?: ResolverInputTypes["smallint_comparison_exp"] | undefined | null
};
	/** unique or primary key constraints on table "customer" */
["customer_constraint"]:customer_constraint;
	/** input type for incrementing numeric columns in table "customer" */
["customer_inc_input"]: {
	active?: number | undefined | null,
	address_id?: ResolverInputTypes["smallint"] | undefined | null,
	customer_id?: number | undefined | null,
	store_id?: ResolverInputTypes["smallint"] | undefined | null
};
	/** input type for inserting data into table "customer" */
["customer_insert_input"]: {
	active?: number | undefined | null,
	activebool?: boolean | undefined | null,
	address_id?: ResolverInputTypes["smallint"] | undefined | null,
	create_date?: ResolverInputTypes["date"] | undefined | null,
	customer_id?: number | undefined | null,
	email?: string | undefined | null,
	first_name?: string | undefined | null,
	last_name?: string | undefined | null,
	last_update?: ResolverInputTypes["timestamp"] | undefined | null,
	store_id?: ResolverInputTypes["smallint"] | undefined | null
};
	/** columns and relationships of "customer_list" */
["customer_list"]: AliasType<{
	address?:boolean | `@${string}`,
	city?:boolean | `@${string}`,
	country?:boolean | `@${string}`,
	id?:boolean | `@${string}`,
	name?:boolean | `@${string}`,
	notes?:boolean | `@${string}`,
	phone?:boolean | `@${string}`,
	sid?:boolean | `@${string}`,
	zip_code?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregated selection of "customer_list" */
["customer_list_aggregate"]: AliasType<{
	aggregate?:ResolverInputTypes["customer_list_aggregate_fields"],
	nodes?:ResolverInputTypes["customer_list"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate fields of "customer_list" */
["customer_list_aggregate_fields"]: AliasType<{
	avg?:ResolverInputTypes["customer_list_avg_fields"],
count?: [{	columns?: Array<ResolverInputTypes["customer_list_select_column"]> | undefined | null,	distinct?: boolean | undefined | null},boolean | `@${string}`],
	max?:ResolverInputTypes["customer_list_max_fields"],
	min?:ResolverInputTypes["customer_list_min_fields"],
	stddev?:ResolverInputTypes["customer_list_stddev_fields"],
	stddev_pop?:ResolverInputTypes["customer_list_stddev_pop_fields"],
	stddev_samp?:ResolverInputTypes["customer_list_stddev_samp_fields"],
	sum?:ResolverInputTypes["customer_list_sum_fields"],
	var_pop?:ResolverInputTypes["customer_list_var_pop_fields"],
	var_samp?:ResolverInputTypes["customer_list_var_samp_fields"],
	variance?:ResolverInputTypes["customer_list_variance_fields"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate avg on columns */
["customer_list_avg_fields"]: AliasType<{
	id?:boolean | `@${string}`,
	sid?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Boolean expression to filter rows from the table "customer_list". All fields are combined with a logical 'AND'. */
["customer_list_bool_exp"]: {
	_and?: Array<ResolverInputTypes["customer_list_bool_exp"]> | undefined | null,
	_not?: ResolverInputTypes["customer_list_bool_exp"] | undefined | null,
	_or?: Array<ResolverInputTypes["customer_list_bool_exp"]> | undefined | null,
	address?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
	city?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
	country?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
	id?: ResolverInputTypes["Int_comparison_exp"] | undefined | null,
	name?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
	notes?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
	phone?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
	sid?: ResolverInputTypes["smallint_comparison_exp"] | undefined | null,
	zip_code?: ResolverInputTypes["String_comparison_exp"] | undefined | null
};
	/** aggregate max on columns */
["customer_list_max_fields"]: AliasType<{
	address?:boolean | `@${string}`,
	city?:boolean | `@${string}`,
	country?:boolean | `@${string}`,
	id?:boolean | `@${string}`,
	name?:boolean | `@${string}`,
	notes?:boolean | `@${string}`,
	phone?:boolean | `@${string}`,
	sid?:boolean | `@${string}`,
	zip_code?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate min on columns */
["customer_list_min_fields"]: AliasType<{
	address?:boolean | `@${string}`,
	city?:boolean | `@${string}`,
	country?:boolean | `@${string}`,
	id?:boolean | `@${string}`,
	name?:boolean | `@${string}`,
	notes?:boolean | `@${string}`,
	phone?:boolean | `@${string}`,
	sid?:boolean | `@${string}`,
	zip_code?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Ordering options when selecting data from "customer_list". */
["customer_list_order_by"]: {
	address?: ResolverInputTypes["order_by"] | undefined | null,
	city?: ResolverInputTypes["order_by"] | undefined | null,
	country?: ResolverInputTypes["order_by"] | undefined | null,
	id?: ResolverInputTypes["order_by"] | undefined | null,
	name?: ResolverInputTypes["order_by"] | undefined | null,
	notes?: ResolverInputTypes["order_by"] | undefined | null,
	phone?: ResolverInputTypes["order_by"] | undefined | null,
	sid?: ResolverInputTypes["order_by"] | undefined | null,
	zip_code?: ResolverInputTypes["order_by"] | undefined | null
};
	/** select columns of table "customer_list" */
["customer_list_select_column"]:customer_list_select_column;
	/** aggregate stddev on columns */
["customer_list_stddev_fields"]: AliasType<{
	id?:boolean | `@${string}`,
	sid?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_pop on columns */
["customer_list_stddev_pop_fields"]: AliasType<{
	id?:boolean | `@${string}`,
	sid?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_samp on columns */
["customer_list_stddev_samp_fields"]: AliasType<{
	id?:boolean | `@${string}`,
	sid?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Streaming cursor of the table "customer_list" */
["customer_list_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ResolverInputTypes["customer_list_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: ResolverInputTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["customer_list_stream_cursor_value_input"]: {
	address?: string | undefined | null,
	city?: string | undefined | null,
	country?: string | undefined | null,
	id?: number | undefined | null,
	name?: string | undefined | null,
	notes?: string | undefined | null,
	phone?: string | undefined | null,
	sid?: ResolverInputTypes["smallint"] | undefined | null,
	zip_code?: string | undefined | null
};
	/** aggregate sum on columns */
["customer_list_sum_fields"]: AliasType<{
	id?:boolean | `@${string}`,
	sid?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_pop on columns */
["customer_list_var_pop_fields"]: AliasType<{
	id?:boolean | `@${string}`,
	sid?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_samp on columns */
["customer_list_var_samp_fields"]: AliasType<{
	id?:boolean | `@${string}`,
	sid?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate variance on columns */
["customer_list_variance_fields"]: AliasType<{
	id?:boolean | `@${string}`,
	sid?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate max on columns */
["customer_max_fields"]: AliasType<{
	active?:boolean | `@${string}`,
	address_id?:boolean | `@${string}`,
	create_date?:boolean | `@${string}`,
	customer_id?:boolean | `@${string}`,
	email?:boolean | `@${string}`,
	first_name?:boolean | `@${string}`,
	last_name?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate min on columns */
["customer_min_fields"]: AliasType<{
	active?:boolean | `@${string}`,
	address_id?:boolean | `@${string}`,
	create_date?:boolean | `@${string}`,
	customer_id?:boolean | `@${string}`,
	email?:boolean | `@${string}`,
	first_name?:boolean | `@${string}`,
	last_name?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** response of any mutation on the table "customer" */
["customer_mutation_response"]: AliasType<{
	/** number of rows affected by the mutation */
	affected_rows?:boolean | `@${string}`,
	/** data from the rows affected by the mutation */
	returning?:ResolverInputTypes["customer"],
		__typename?: boolean | `@${string}`
}>;
	/** on_conflict condition type for table "customer" */
["customer_on_conflict"]: {
	constraint: ResolverInputTypes["customer_constraint"],
	update_columns: Array<ResolverInputTypes["customer_update_column"]>,
	where?: ResolverInputTypes["customer_bool_exp"] | undefined | null
};
	/** Ordering options when selecting data from "customer". */
["customer_order_by"]: {
	active?: ResolverInputTypes["order_by"] | undefined | null,
	activebool?: ResolverInputTypes["order_by"] | undefined | null,
	address_id?: ResolverInputTypes["order_by"] | undefined | null,
	create_date?: ResolverInputTypes["order_by"] | undefined | null,
	customer_id?: ResolverInputTypes["order_by"] | undefined | null,
	email?: ResolverInputTypes["order_by"] | undefined | null,
	first_name?: ResolverInputTypes["order_by"] | undefined | null,
	last_name?: ResolverInputTypes["order_by"] | undefined | null,
	last_update?: ResolverInputTypes["order_by"] | undefined | null,
	store_id?: ResolverInputTypes["order_by"] | undefined | null
};
	/** primary key columns input for table: customer */
["customer_pk_columns_input"]: {
	customer_id: number
};
	/** select columns of table "customer" */
["customer_select_column"]:customer_select_column;
	/** input type for updating data in table "customer" */
["customer_set_input"]: {
	active?: number | undefined | null,
	activebool?: boolean | undefined | null,
	address_id?: ResolverInputTypes["smallint"] | undefined | null,
	create_date?: ResolverInputTypes["date"] | undefined | null,
	customer_id?: number | undefined | null,
	email?: string | undefined | null,
	first_name?: string | undefined | null,
	last_name?: string | undefined | null,
	last_update?: ResolverInputTypes["timestamp"] | undefined | null,
	store_id?: ResolverInputTypes["smallint"] | undefined | null
};
	/** aggregate stddev on columns */
["customer_stddev_fields"]: AliasType<{
	active?:boolean | `@${string}`,
	address_id?:boolean | `@${string}`,
	customer_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_pop on columns */
["customer_stddev_pop_fields"]: AliasType<{
	active?:boolean | `@${string}`,
	address_id?:boolean | `@${string}`,
	customer_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_samp on columns */
["customer_stddev_samp_fields"]: AliasType<{
	active?:boolean | `@${string}`,
	address_id?:boolean | `@${string}`,
	customer_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Streaming cursor of the table "customer" */
["customer_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ResolverInputTypes["customer_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: ResolverInputTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["customer_stream_cursor_value_input"]: {
	active?: number | undefined | null,
	activebool?: boolean | undefined | null,
	address_id?: ResolverInputTypes["smallint"] | undefined | null,
	create_date?: ResolverInputTypes["date"] | undefined | null,
	customer_id?: number | undefined | null,
	email?: string | undefined | null,
	first_name?: string | undefined | null,
	last_name?: string | undefined | null,
	last_update?: ResolverInputTypes["timestamp"] | undefined | null,
	store_id?: ResolverInputTypes["smallint"] | undefined | null
};
	/** aggregate sum on columns */
["customer_sum_fields"]: AliasType<{
	active?:boolean | `@${string}`,
	address_id?:boolean | `@${string}`,
	customer_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** update columns of table "customer" */
["customer_update_column"]:customer_update_column;
	["customer_updates"]: {
	/** increments the numeric columns with given value of the filtered values */
	_inc?: ResolverInputTypes["customer_inc_input"] | undefined | null,
	/** sets the columns of the filtered rows to the given values */
	_set?: ResolverInputTypes["customer_set_input"] | undefined | null,
	/** filter the rows which have to be updated */
	where: ResolverInputTypes["customer_bool_exp"]
};
	/** aggregate var_pop on columns */
["customer_var_pop_fields"]: AliasType<{
	active?:boolean | `@${string}`,
	address_id?:boolean | `@${string}`,
	customer_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_samp on columns */
["customer_var_samp_fields"]: AliasType<{
	active?:boolean | `@${string}`,
	address_id?:boolean | `@${string}`,
	customer_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate variance on columns */
["customer_variance_fields"]: AliasType<{
	active?:boolean | `@${string}`,
	address_id?:boolean | `@${string}`,
	customer_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	["date"]:unknown;
	/** Boolean expression to compare columns of type "date". All fields are combined with logical 'AND'. */
["date_comparison_exp"]: {
	_eq?: ResolverInputTypes["date"] | undefined | null,
	_gt?: ResolverInputTypes["date"] | undefined | null,
	_gte?: ResolverInputTypes["date"] | undefined | null,
	_in?: Array<ResolverInputTypes["date"]> | undefined | null,
	_is_null?: boolean | undefined | null,
	_lt?: ResolverInputTypes["date"] | undefined | null,
	_lte?: ResolverInputTypes["date"] | undefined | null,
	_neq?: ResolverInputTypes["date"] | undefined | null,
	_nin?: Array<ResolverInputTypes["date"]> | undefined | null
};
	/** columns and relationships of "film" */
["film"]: AliasType<{
	description?:boolean | `@${string}`,
	film_id?:boolean | `@${string}`,
	fulltext?:boolean | `@${string}`,
	language_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	rating?:boolean | `@${string}`,
	release_year?:boolean | `@${string}`,
	rental_duration?:boolean | `@${string}`,
	rental_rate?:boolean | `@${string}`,
	replacement_cost?:boolean | `@${string}`,
	special_features?:boolean | `@${string}`,
	title?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** columns and relationships of "film_actor" */
["film_actor"]: AliasType<{
	actor_id?:boolean | `@${string}`,
	film_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregated selection of "film_actor" */
["film_actor_aggregate"]: AliasType<{
	aggregate?:ResolverInputTypes["film_actor_aggregate_fields"],
	nodes?:ResolverInputTypes["film_actor"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate fields of "film_actor" */
["film_actor_aggregate_fields"]: AliasType<{
	avg?:ResolverInputTypes["film_actor_avg_fields"],
count?: [{	columns?: Array<ResolverInputTypes["film_actor_select_column"]> | undefined | null,	distinct?: boolean | undefined | null},boolean | `@${string}`],
	max?:ResolverInputTypes["film_actor_max_fields"],
	min?:ResolverInputTypes["film_actor_min_fields"],
	stddev?:ResolverInputTypes["film_actor_stddev_fields"],
	stddev_pop?:ResolverInputTypes["film_actor_stddev_pop_fields"],
	stddev_samp?:ResolverInputTypes["film_actor_stddev_samp_fields"],
	sum?:ResolverInputTypes["film_actor_sum_fields"],
	var_pop?:ResolverInputTypes["film_actor_var_pop_fields"],
	var_samp?:ResolverInputTypes["film_actor_var_samp_fields"],
	variance?:ResolverInputTypes["film_actor_variance_fields"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate avg on columns */
["film_actor_avg_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
	film_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Boolean expression to filter rows from the table "film_actor". All fields are combined with a logical 'AND'. */
["film_actor_bool_exp"]: {
	_and?: Array<ResolverInputTypes["film_actor_bool_exp"]> | undefined | null,
	_not?: ResolverInputTypes["film_actor_bool_exp"] | undefined | null,
	_or?: Array<ResolverInputTypes["film_actor_bool_exp"]> | undefined | null,
	actor_id?: ResolverInputTypes["smallint_comparison_exp"] | undefined | null,
	film_id?: ResolverInputTypes["smallint_comparison_exp"] | undefined | null,
	last_update?: ResolverInputTypes["timestamp_comparison_exp"] | undefined | null
};
	/** unique or primary key constraints on table "film_actor" */
["film_actor_constraint"]:film_actor_constraint;
	/** input type for incrementing numeric columns in table "film_actor" */
["film_actor_inc_input"]: {
	actor_id?: ResolverInputTypes["smallint"] | undefined | null,
	film_id?: ResolverInputTypes["smallint"] | undefined | null
};
	/** input type for inserting data into table "film_actor" */
["film_actor_insert_input"]: {
	actor_id?: ResolverInputTypes["smallint"] | undefined | null,
	film_id?: ResolverInputTypes["smallint"] | undefined | null,
	last_update?: ResolverInputTypes["timestamp"] | undefined | null
};
	/** aggregate max on columns */
["film_actor_max_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
	film_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate min on columns */
["film_actor_min_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
	film_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** response of any mutation on the table "film_actor" */
["film_actor_mutation_response"]: AliasType<{
	/** number of rows affected by the mutation */
	affected_rows?:boolean | `@${string}`,
	/** data from the rows affected by the mutation */
	returning?:ResolverInputTypes["film_actor"],
		__typename?: boolean | `@${string}`
}>;
	/** on_conflict condition type for table "film_actor" */
["film_actor_on_conflict"]: {
	constraint: ResolverInputTypes["film_actor_constraint"],
	update_columns: Array<ResolverInputTypes["film_actor_update_column"]>,
	where?: ResolverInputTypes["film_actor_bool_exp"] | undefined | null
};
	/** Ordering options when selecting data from "film_actor". */
["film_actor_order_by"]: {
	actor_id?: ResolverInputTypes["order_by"] | undefined | null,
	film_id?: ResolverInputTypes["order_by"] | undefined | null,
	last_update?: ResolverInputTypes["order_by"] | undefined | null
};
	/** primary key columns input for table: film_actor */
["film_actor_pk_columns_input"]: {
	actor_id: ResolverInputTypes["smallint"],
	film_id: ResolverInputTypes["smallint"]
};
	/** select columns of table "film_actor" */
["film_actor_select_column"]:film_actor_select_column;
	/** input type for updating data in table "film_actor" */
["film_actor_set_input"]: {
	actor_id?: ResolverInputTypes["smallint"] | undefined | null,
	film_id?: ResolverInputTypes["smallint"] | undefined | null,
	last_update?: ResolverInputTypes["timestamp"] | undefined | null
};
	/** aggregate stddev on columns */
["film_actor_stddev_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
	film_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_pop on columns */
["film_actor_stddev_pop_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
	film_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_samp on columns */
["film_actor_stddev_samp_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
	film_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Streaming cursor of the table "film_actor" */
["film_actor_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ResolverInputTypes["film_actor_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: ResolverInputTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["film_actor_stream_cursor_value_input"]: {
	actor_id?: ResolverInputTypes["smallint"] | undefined | null,
	film_id?: ResolverInputTypes["smallint"] | undefined | null,
	last_update?: ResolverInputTypes["timestamp"] | undefined | null
};
	/** aggregate sum on columns */
["film_actor_sum_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
	film_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** update columns of table "film_actor" */
["film_actor_update_column"]:film_actor_update_column;
	["film_actor_updates"]: {
	/** increments the numeric columns with given value of the filtered values */
	_inc?: ResolverInputTypes["film_actor_inc_input"] | undefined | null,
	/** sets the columns of the filtered rows to the given values */
	_set?: ResolverInputTypes["film_actor_set_input"] | undefined | null,
	/** filter the rows which have to be updated */
	where: ResolverInputTypes["film_actor_bool_exp"]
};
	/** aggregate var_pop on columns */
["film_actor_var_pop_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
	film_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_samp on columns */
["film_actor_var_samp_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
	film_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate variance on columns */
["film_actor_variance_fields"]: AliasType<{
	actor_id?:boolean | `@${string}`,
	film_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregated selection of "film" */
["film_aggregate"]: AliasType<{
	aggregate?:ResolverInputTypes["film_aggregate_fields"],
	nodes?:ResolverInputTypes["film"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate fields of "film" */
["film_aggregate_fields"]: AliasType<{
	avg?:ResolverInputTypes["film_avg_fields"],
count?: [{	columns?: Array<ResolverInputTypes["film_select_column"]> | undefined | null,	distinct?: boolean | undefined | null},boolean | `@${string}`],
	max?:ResolverInputTypes["film_max_fields"],
	min?:ResolverInputTypes["film_min_fields"],
	stddev?:ResolverInputTypes["film_stddev_fields"],
	stddev_pop?:ResolverInputTypes["film_stddev_pop_fields"],
	stddev_samp?:ResolverInputTypes["film_stddev_samp_fields"],
	sum?:ResolverInputTypes["film_sum_fields"],
	var_pop?:ResolverInputTypes["film_var_pop_fields"],
	var_samp?:ResolverInputTypes["film_var_samp_fields"],
	variance?:ResolverInputTypes["film_variance_fields"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate avg on columns */
["film_avg_fields"]: AliasType<{
	film_id?:boolean | `@${string}`,
	language_id?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	release_year?:boolean | `@${string}`,
	rental_duration?:boolean | `@${string}`,
	rental_rate?:boolean | `@${string}`,
	replacement_cost?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Boolean expression to filter rows from the table "film". All fields are combined with a logical 'AND'. */
["film_bool_exp"]: {
	_and?: Array<ResolverInputTypes["film_bool_exp"]> | undefined | null,
	_not?: ResolverInputTypes["film_bool_exp"] | undefined | null,
	_or?: Array<ResolverInputTypes["film_bool_exp"]> | undefined | null,
	description?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
	film_id?: ResolverInputTypes["Int_comparison_exp"] | undefined | null,
	fulltext?: ResolverInputTypes["tsvector_comparison_exp"] | undefined | null,
	language_id?: ResolverInputTypes["smallint_comparison_exp"] | undefined | null,
	last_update?: ResolverInputTypes["timestamp_comparison_exp"] | undefined | null,
	length?: ResolverInputTypes["smallint_comparison_exp"] | undefined | null,
	rating?: ResolverInputTypes["mpaa_rating_comparison_exp"] | undefined | null,
	release_year?: ResolverInputTypes["Int_comparison_exp"] | undefined | null,
	rental_duration?: ResolverInputTypes["smallint_comparison_exp"] | undefined | null,
	rental_rate?: ResolverInputTypes["numeric_comparison_exp"] | undefined | null,
	replacement_cost?: ResolverInputTypes["numeric_comparison_exp"] | undefined | null,
	special_features?: ResolverInputTypes["_text_comparison_exp"] | undefined | null,
	title?: ResolverInputTypes["String_comparison_exp"] | undefined | null
};
	/** columns and relationships of "film_category" */
["film_category"]: AliasType<{
	category_id?:boolean | `@${string}`,
	film_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregated selection of "film_category" */
["film_category_aggregate"]: AliasType<{
	aggregate?:ResolverInputTypes["film_category_aggregate_fields"],
	nodes?:ResolverInputTypes["film_category"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate fields of "film_category" */
["film_category_aggregate_fields"]: AliasType<{
	avg?:ResolverInputTypes["film_category_avg_fields"],
count?: [{	columns?: Array<ResolverInputTypes["film_category_select_column"]> | undefined | null,	distinct?: boolean | undefined | null},boolean | `@${string}`],
	max?:ResolverInputTypes["film_category_max_fields"],
	min?:ResolverInputTypes["film_category_min_fields"],
	stddev?:ResolverInputTypes["film_category_stddev_fields"],
	stddev_pop?:ResolverInputTypes["film_category_stddev_pop_fields"],
	stddev_samp?:ResolverInputTypes["film_category_stddev_samp_fields"],
	sum?:ResolverInputTypes["film_category_sum_fields"],
	var_pop?:ResolverInputTypes["film_category_var_pop_fields"],
	var_samp?:ResolverInputTypes["film_category_var_samp_fields"],
	variance?:ResolverInputTypes["film_category_variance_fields"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate avg on columns */
["film_category_avg_fields"]: AliasType<{
	category_id?:boolean | `@${string}`,
	film_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Boolean expression to filter rows from the table "film_category". All fields are combined with a logical 'AND'. */
["film_category_bool_exp"]: {
	_and?: Array<ResolverInputTypes["film_category_bool_exp"]> | undefined | null,
	_not?: ResolverInputTypes["film_category_bool_exp"] | undefined | null,
	_or?: Array<ResolverInputTypes["film_category_bool_exp"]> | undefined | null,
	category_id?: ResolverInputTypes["smallint_comparison_exp"] | undefined | null,
	film_id?: ResolverInputTypes["smallint_comparison_exp"] | undefined | null,
	last_update?: ResolverInputTypes["timestamp_comparison_exp"] | undefined | null
};
	/** unique or primary key constraints on table "film_category" */
["film_category_constraint"]:film_category_constraint;
	/** input type for incrementing numeric columns in table "film_category" */
["film_category_inc_input"]: {
	category_id?: ResolverInputTypes["smallint"] | undefined | null,
	film_id?: ResolverInputTypes["smallint"] | undefined | null
};
	/** input type for inserting data into table "film_category" */
["film_category_insert_input"]: {
	category_id?: ResolverInputTypes["smallint"] | undefined | null,
	film_id?: ResolverInputTypes["smallint"] | undefined | null,
	last_update?: ResolverInputTypes["timestamp"] | undefined | null
};
	/** aggregate max on columns */
["film_category_max_fields"]: AliasType<{
	category_id?:boolean | `@${string}`,
	film_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate min on columns */
["film_category_min_fields"]: AliasType<{
	category_id?:boolean | `@${string}`,
	film_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** response of any mutation on the table "film_category" */
["film_category_mutation_response"]: AliasType<{
	/** number of rows affected by the mutation */
	affected_rows?:boolean | `@${string}`,
	/** data from the rows affected by the mutation */
	returning?:ResolverInputTypes["film_category"],
		__typename?: boolean | `@${string}`
}>;
	/** on_conflict condition type for table "film_category" */
["film_category_on_conflict"]: {
	constraint: ResolverInputTypes["film_category_constraint"],
	update_columns: Array<ResolverInputTypes["film_category_update_column"]>,
	where?: ResolverInputTypes["film_category_bool_exp"] | undefined | null
};
	/** Ordering options when selecting data from "film_category". */
["film_category_order_by"]: {
	category_id?: ResolverInputTypes["order_by"] | undefined | null,
	film_id?: ResolverInputTypes["order_by"] | undefined | null,
	last_update?: ResolverInputTypes["order_by"] | undefined | null
};
	/** primary key columns input for table: film_category */
["film_category_pk_columns_input"]: {
	category_id: ResolverInputTypes["smallint"],
	film_id: ResolverInputTypes["smallint"]
};
	/** select columns of table "film_category" */
["film_category_select_column"]:film_category_select_column;
	/** input type for updating data in table "film_category" */
["film_category_set_input"]: {
	category_id?: ResolverInputTypes["smallint"] | undefined | null,
	film_id?: ResolverInputTypes["smallint"] | undefined | null,
	last_update?: ResolverInputTypes["timestamp"] | undefined | null
};
	/** aggregate stddev on columns */
["film_category_stddev_fields"]: AliasType<{
	category_id?:boolean | `@${string}`,
	film_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_pop on columns */
["film_category_stddev_pop_fields"]: AliasType<{
	category_id?:boolean | `@${string}`,
	film_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_samp on columns */
["film_category_stddev_samp_fields"]: AliasType<{
	category_id?:boolean | `@${string}`,
	film_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Streaming cursor of the table "film_category" */
["film_category_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ResolverInputTypes["film_category_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: ResolverInputTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["film_category_stream_cursor_value_input"]: {
	category_id?: ResolverInputTypes["smallint"] | undefined | null,
	film_id?: ResolverInputTypes["smallint"] | undefined | null,
	last_update?: ResolverInputTypes["timestamp"] | undefined | null
};
	/** aggregate sum on columns */
["film_category_sum_fields"]: AliasType<{
	category_id?:boolean | `@${string}`,
	film_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** update columns of table "film_category" */
["film_category_update_column"]:film_category_update_column;
	["film_category_updates"]: {
	/** increments the numeric columns with given value of the filtered values */
	_inc?: ResolverInputTypes["film_category_inc_input"] | undefined | null,
	/** sets the columns of the filtered rows to the given values */
	_set?: ResolverInputTypes["film_category_set_input"] | undefined | null,
	/** filter the rows which have to be updated */
	where: ResolverInputTypes["film_category_bool_exp"]
};
	/** aggregate var_pop on columns */
["film_category_var_pop_fields"]: AliasType<{
	category_id?:boolean | `@${string}`,
	film_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_samp on columns */
["film_category_var_samp_fields"]: AliasType<{
	category_id?:boolean | `@${string}`,
	film_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate variance on columns */
["film_category_variance_fields"]: AliasType<{
	category_id?:boolean | `@${string}`,
	film_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** unique or primary key constraints on table "film" */
["film_constraint"]:film_constraint;
	/** input type for incrementing numeric columns in table "film" */
["film_inc_input"]: {
	film_id?: number | undefined | null,
	language_id?: ResolverInputTypes["smallint"] | undefined | null,
	length?: ResolverInputTypes["smallint"] | undefined | null,
	release_year?: number | undefined | null,
	rental_duration?: ResolverInputTypes["smallint"] | undefined | null,
	rental_rate?: ResolverInputTypes["numeric"] | undefined | null,
	replacement_cost?: ResolverInputTypes["numeric"] | undefined | null
};
	/** input type for inserting data into table "film" */
["film_insert_input"]: {
	description?: string | undefined | null,
	film_id?: number | undefined | null,
	fulltext?: ResolverInputTypes["tsvector"] | undefined | null,
	language_id?: ResolverInputTypes["smallint"] | undefined | null,
	last_update?: ResolverInputTypes["timestamp"] | undefined | null,
	length?: ResolverInputTypes["smallint"] | undefined | null,
	rating?: ResolverInputTypes["mpaa_rating"] | undefined | null,
	release_year?: number | undefined | null,
	rental_duration?: ResolverInputTypes["smallint"] | undefined | null,
	rental_rate?: ResolverInputTypes["numeric"] | undefined | null,
	replacement_cost?: ResolverInputTypes["numeric"] | undefined | null,
	special_features?: ResolverInputTypes["_text"] | undefined | null,
	title?: string | undefined | null
};
	/** columns and relationships of "film_list" */
["film_list"]: AliasType<{
	actors?:boolean | `@${string}`,
	category?:boolean | `@${string}`,
	description?:boolean | `@${string}`,
	fid?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	price?:boolean | `@${string}`,
	rating?:boolean | `@${string}`,
	title?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregated selection of "film_list" */
["film_list_aggregate"]: AliasType<{
	aggregate?:ResolverInputTypes["film_list_aggregate_fields"],
	nodes?:ResolverInputTypes["film_list"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate fields of "film_list" */
["film_list_aggregate_fields"]: AliasType<{
	avg?:ResolverInputTypes["film_list_avg_fields"],
count?: [{	columns?: Array<ResolverInputTypes["film_list_select_column"]> | undefined | null,	distinct?: boolean | undefined | null},boolean | `@${string}`],
	max?:ResolverInputTypes["film_list_max_fields"],
	min?:ResolverInputTypes["film_list_min_fields"],
	stddev?:ResolverInputTypes["film_list_stddev_fields"],
	stddev_pop?:ResolverInputTypes["film_list_stddev_pop_fields"],
	stddev_samp?:ResolverInputTypes["film_list_stddev_samp_fields"],
	sum?:ResolverInputTypes["film_list_sum_fields"],
	var_pop?:ResolverInputTypes["film_list_var_pop_fields"],
	var_samp?:ResolverInputTypes["film_list_var_samp_fields"],
	variance?:ResolverInputTypes["film_list_variance_fields"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate avg on columns */
["film_list_avg_fields"]: AliasType<{
	fid?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	price?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Boolean expression to filter rows from the table "film_list". All fields are combined with a logical 'AND'. */
["film_list_bool_exp"]: {
	_and?: Array<ResolverInputTypes["film_list_bool_exp"]> | undefined | null,
	_not?: ResolverInputTypes["film_list_bool_exp"] | undefined | null,
	_or?: Array<ResolverInputTypes["film_list_bool_exp"]> | undefined | null,
	actors?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
	category?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
	description?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
	fid?: ResolverInputTypes["Int_comparison_exp"] | undefined | null,
	length?: ResolverInputTypes["smallint_comparison_exp"] | undefined | null,
	price?: ResolverInputTypes["numeric_comparison_exp"] | undefined | null,
	rating?: ResolverInputTypes["mpaa_rating_comparison_exp"] | undefined | null,
	title?: ResolverInputTypes["String_comparison_exp"] | undefined | null
};
	/** aggregate max on columns */
["film_list_max_fields"]: AliasType<{
	actors?:boolean | `@${string}`,
	category?:boolean | `@${string}`,
	description?:boolean | `@${string}`,
	fid?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	price?:boolean | `@${string}`,
	rating?:boolean | `@${string}`,
	title?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate min on columns */
["film_list_min_fields"]: AliasType<{
	actors?:boolean | `@${string}`,
	category?:boolean | `@${string}`,
	description?:boolean | `@${string}`,
	fid?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	price?:boolean | `@${string}`,
	rating?:boolean | `@${string}`,
	title?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Ordering options when selecting data from "film_list". */
["film_list_order_by"]: {
	actors?: ResolverInputTypes["order_by"] | undefined | null,
	category?: ResolverInputTypes["order_by"] | undefined | null,
	description?: ResolverInputTypes["order_by"] | undefined | null,
	fid?: ResolverInputTypes["order_by"] | undefined | null,
	length?: ResolverInputTypes["order_by"] | undefined | null,
	price?: ResolverInputTypes["order_by"] | undefined | null,
	rating?: ResolverInputTypes["order_by"] | undefined | null,
	title?: ResolverInputTypes["order_by"] | undefined | null
};
	/** select columns of table "film_list" */
["film_list_select_column"]:film_list_select_column;
	/** aggregate stddev on columns */
["film_list_stddev_fields"]: AliasType<{
	fid?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	price?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_pop on columns */
["film_list_stddev_pop_fields"]: AliasType<{
	fid?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	price?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_samp on columns */
["film_list_stddev_samp_fields"]: AliasType<{
	fid?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	price?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Streaming cursor of the table "film_list" */
["film_list_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ResolverInputTypes["film_list_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: ResolverInputTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["film_list_stream_cursor_value_input"]: {
	actors?: string | undefined | null,
	category?: string | undefined | null,
	description?: string | undefined | null,
	fid?: number | undefined | null,
	length?: ResolverInputTypes["smallint"] | undefined | null,
	price?: ResolverInputTypes["numeric"] | undefined | null,
	rating?: ResolverInputTypes["mpaa_rating"] | undefined | null,
	title?: string | undefined | null
};
	/** aggregate sum on columns */
["film_list_sum_fields"]: AliasType<{
	fid?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	price?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_pop on columns */
["film_list_var_pop_fields"]: AliasType<{
	fid?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	price?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_samp on columns */
["film_list_var_samp_fields"]: AliasType<{
	fid?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	price?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate variance on columns */
["film_list_variance_fields"]: AliasType<{
	fid?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	price?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate max on columns */
["film_max_fields"]: AliasType<{
	description?:boolean | `@${string}`,
	film_id?:boolean | `@${string}`,
	language_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	rating?:boolean | `@${string}`,
	release_year?:boolean | `@${string}`,
	rental_duration?:boolean | `@${string}`,
	rental_rate?:boolean | `@${string}`,
	replacement_cost?:boolean | `@${string}`,
	title?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate min on columns */
["film_min_fields"]: AliasType<{
	description?:boolean | `@${string}`,
	film_id?:boolean | `@${string}`,
	language_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	rating?:boolean | `@${string}`,
	release_year?:boolean | `@${string}`,
	rental_duration?:boolean | `@${string}`,
	rental_rate?:boolean | `@${string}`,
	replacement_cost?:boolean | `@${string}`,
	title?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** response of any mutation on the table "film" */
["film_mutation_response"]: AliasType<{
	/** number of rows affected by the mutation */
	affected_rows?:boolean | `@${string}`,
	/** data from the rows affected by the mutation */
	returning?:ResolverInputTypes["film"],
		__typename?: boolean | `@${string}`
}>;
	/** on_conflict condition type for table "film" */
["film_on_conflict"]: {
	constraint: ResolverInputTypes["film_constraint"],
	update_columns: Array<ResolverInputTypes["film_update_column"]>,
	where?: ResolverInputTypes["film_bool_exp"] | undefined | null
};
	/** Ordering options when selecting data from "film". */
["film_order_by"]: {
	description?: ResolverInputTypes["order_by"] | undefined | null,
	film_id?: ResolverInputTypes["order_by"] | undefined | null,
	fulltext?: ResolverInputTypes["order_by"] | undefined | null,
	language_id?: ResolverInputTypes["order_by"] | undefined | null,
	last_update?: ResolverInputTypes["order_by"] | undefined | null,
	length?: ResolverInputTypes["order_by"] | undefined | null,
	rating?: ResolverInputTypes["order_by"] | undefined | null,
	release_year?: ResolverInputTypes["order_by"] | undefined | null,
	rental_duration?: ResolverInputTypes["order_by"] | undefined | null,
	rental_rate?: ResolverInputTypes["order_by"] | undefined | null,
	replacement_cost?: ResolverInputTypes["order_by"] | undefined | null,
	special_features?: ResolverInputTypes["order_by"] | undefined | null,
	title?: ResolverInputTypes["order_by"] | undefined | null
};
	/** primary key columns input for table: film */
["film_pk_columns_input"]: {
	film_id: number
};
	/** select columns of table "film" */
["film_select_column"]:film_select_column;
	/** input type for updating data in table "film" */
["film_set_input"]: {
	description?: string | undefined | null,
	film_id?: number | undefined | null,
	fulltext?: ResolverInputTypes["tsvector"] | undefined | null,
	language_id?: ResolverInputTypes["smallint"] | undefined | null,
	last_update?: ResolverInputTypes["timestamp"] | undefined | null,
	length?: ResolverInputTypes["smallint"] | undefined | null,
	rating?: ResolverInputTypes["mpaa_rating"] | undefined | null,
	release_year?: number | undefined | null,
	rental_duration?: ResolverInputTypes["smallint"] | undefined | null,
	rental_rate?: ResolverInputTypes["numeric"] | undefined | null,
	replacement_cost?: ResolverInputTypes["numeric"] | undefined | null,
	special_features?: ResolverInputTypes["_text"] | undefined | null,
	title?: string | undefined | null
};
	/** aggregate stddev on columns */
["film_stddev_fields"]: AliasType<{
	film_id?:boolean | `@${string}`,
	language_id?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	release_year?:boolean | `@${string}`,
	rental_duration?:boolean | `@${string}`,
	rental_rate?:boolean | `@${string}`,
	replacement_cost?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_pop on columns */
["film_stddev_pop_fields"]: AliasType<{
	film_id?:boolean | `@${string}`,
	language_id?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	release_year?:boolean | `@${string}`,
	rental_duration?:boolean | `@${string}`,
	rental_rate?:boolean | `@${string}`,
	replacement_cost?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_samp on columns */
["film_stddev_samp_fields"]: AliasType<{
	film_id?:boolean | `@${string}`,
	language_id?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	release_year?:boolean | `@${string}`,
	rental_duration?:boolean | `@${string}`,
	rental_rate?:boolean | `@${string}`,
	replacement_cost?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Streaming cursor of the table "film" */
["film_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ResolverInputTypes["film_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: ResolverInputTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["film_stream_cursor_value_input"]: {
	description?: string | undefined | null,
	film_id?: number | undefined | null,
	fulltext?: ResolverInputTypes["tsvector"] | undefined | null,
	language_id?: ResolverInputTypes["smallint"] | undefined | null,
	last_update?: ResolverInputTypes["timestamp"] | undefined | null,
	length?: ResolverInputTypes["smallint"] | undefined | null,
	rating?: ResolverInputTypes["mpaa_rating"] | undefined | null,
	release_year?: number | undefined | null,
	rental_duration?: ResolverInputTypes["smallint"] | undefined | null,
	rental_rate?: ResolverInputTypes["numeric"] | undefined | null,
	replacement_cost?: ResolverInputTypes["numeric"] | undefined | null,
	special_features?: ResolverInputTypes["_text"] | undefined | null,
	title?: string | undefined | null
};
	/** aggregate sum on columns */
["film_sum_fields"]: AliasType<{
	film_id?:boolean | `@${string}`,
	language_id?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	release_year?:boolean | `@${string}`,
	rental_duration?:boolean | `@${string}`,
	rental_rate?:boolean | `@${string}`,
	replacement_cost?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** update columns of table "film" */
["film_update_column"]:film_update_column;
	["film_updates"]: {
	/** increments the numeric columns with given value of the filtered values */
	_inc?: ResolverInputTypes["film_inc_input"] | undefined | null,
	/** sets the columns of the filtered rows to the given values */
	_set?: ResolverInputTypes["film_set_input"] | undefined | null,
	/** filter the rows which have to be updated */
	where: ResolverInputTypes["film_bool_exp"]
};
	/** aggregate var_pop on columns */
["film_var_pop_fields"]: AliasType<{
	film_id?:boolean | `@${string}`,
	language_id?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	release_year?:boolean | `@${string}`,
	rental_duration?:boolean | `@${string}`,
	rental_rate?:boolean | `@${string}`,
	replacement_cost?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_samp on columns */
["film_var_samp_fields"]: AliasType<{
	film_id?:boolean | `@${string}`,
	language_id?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	release_year?:boolean | `@${string}`,
	rental_duration?:boolean | `@${string}`,
	rental_rate?:boolean | `@${string}`,
	replacement_cost?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate variance on columns */
["film_variance_fields"]: AliasType<{
	film_id?:boolean | `@${string}`,
	language_id?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	release_year?:boolean | `@${string}`,
	rental_duration?:boolean | `@${string}`,
	rental_rate?:boolean | `@${string}`,
	replacement_cost?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** columns and relationships of "inventory" */
["inventory"]: AliasType<{
	film_id?:boolean | `@${string}`,
	inventory_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregated selection of "inventory" */
["inventory_aggregate"]: AliasType<{
	aggregate?:ResolverInputTypes["inventory_aggregate_fields"],
	nodes?:ResolverInputTypes["inventory"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate fields of "inventory" */
["inventory_aggregate_fields"]: AliasType<{
	avg?:ResolverInputTypes["inventory_avg_fields"],
count?: [{	columns?: Array<ResolverInputTypes["inventory_select_column"]> | undefined | null,	distinct?: boolean | undefined | null},boolean | `@${string}`],
	max?:ResolverInputTypes["inventory_max_fields"],
	min?:ResolverInputTypes["inventory_min_fields"],
	stddev?:ResolverInputTypes["inventory_stddev_fields"],
	stddev_pop?:ResolverInputTypes["inventory_stddev_pop_fields"],
	stddev_samp?:ResolverInputTypes["inventory_stddev_samp_fields"],
	sum?:ResolverInputTypes["inventory_sum_fields"],
	var_pop?:ResolverInputTypes["inventory_var_pop_fields"],
	var_samp?:ResolverInputTypes["inventory_var_samp_fields"],
	variance?:ResolverInputTypes["inventory_variance_fields"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate avg on columns */
["inventory_avg_fields"]: AliasType<{
	film_id?:boolean | `@${string}`,
	inventory_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Boolean expression to filter rows from the table "inventory". All fields are combined with a logical 'AND'. */
["inventory_bool_exp"]: {
	_and?: Array<ResolverInputTypes["inventory_bool_exp"]> | undefined | null,
	_not?: ResolverInputTypes["inventory_bool_exp"] | undefined | null,
	_or?: Array<ResolverInputTypes["inventory_bool_exp"]> | undefined | null,
	film_id?: ResolverInputTypes["smallint_comparison_exp"] | undefined | null,
	inventory_id?: ResolverInputTypes["Int_comparison_exp"] | undefined | null,
	last_update?: ResolverInputTypes["timestamp_comparison_exp"] | undefined | null,
	store_id?: ResolverInputTypes["smallint_comparison_exp"] | undefined | null
};
	/** unique or primary key constraints on table "inventory" */
["inventory_constraint"]:inventory_constraint;
	/** input type for incrementing numeric columns in table "inventory" */
["inventory_inc_input"]: {
	film_id?: ResolverInputTypes["smallint"] | undefined | null,
	inventory_id?: number | undefined | null,
	store_id?: ResolverInputTypes["smallint"] | undefined | null
};
	/** input type for inserting data into table "inventory" */
["inventory_insert_input"]: {
	film_id?: ResolverInputTypes["smallint"] | undefined | null,
	inventory_id?: number | undefined | null,
	last_update?: ResolverInputTypes["timestamp"] | undefined | null,
	store_id?: ResolverInputTypes["smallint"] | undefined | null
};
	/** aggregate max on columns */
["inventory_max_fields"]: AliasType<{
	film_id?:boolean | `@${string}`,
	inventory_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate min on columns */
["inventory_min_fields"]: AliasType<{
	film_id?:boolean | `@${string}`,
	inventory_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** response of any mutation on the table "inventory" */
["inventory_mutation_response"]: AliasType<{
	/** number of rows affected by the mutation */
	affected_rows?:boolean | `@${string}`,
	/** data from the rows affected by the mutation */
	returning?:ResolverInputTypes["inventory"],
		__typename?: boolean | `@${string}`
}>;
	/** on_conflict condition type for table "inventory" */
["inventory_on_conflict"]: {
	constraint: ResolverInputTypes["inventory_constraint"],
	update_columns: Array<ResolverInputTypes["inventory_update_column"]>,
	where?: ResolverInputTypes["inventory_bool_exp"] | undefined | null
};
	/** Ordering options when selecting data from "inventory". */
["inventory_order_by"]: {
	film_id?: ResolverInputTypes["order_by"] | undefined | null,
	inventory_id?: ResolverInputTypes["order_by"] | undefined | null,
	last_update?: ResolverInputTypes["order_by"] | undefined | null,
	store_id?: ResolverInputTypes["order_by"] | undefined | null
};
	/** primary key columns input for table: inventory */
["inventory_pk_columns_input"]: {
	inventory_id: number
};
	/** select columns of table "inventory" */
["inventory_select_column"]:inventory_select_column;
	/** input type for updating data in table "inventory" */
["inventory_set_input"]: {
	film_id?: ResolverInputTypes["smallint"] | undefined | null,
	inventory_id?: number | undefined | null,
	last_update?: ResolverInputTypes["timestamp"] | undefined | null,
	store_id?: ResolverInputTypes["smallint"] | undefined | null
};
	/** aggregate stddev on columns */
["inventory_stddev_fields"]: AliasType<{
	film_id?:boolean | `@${string}`,
	inventory_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_pop on columns */
["inventory_stddev_pop_fields"]: AliasType<{
	film_id?:boolean | `@${string}`,
	inventory_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_samp on columns */
["inventory_stddev_samp_fields"]: AliasType<{
	film_id?:boolean | `@${string}`,
	inventory_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Streaming cursor of the table "inventory" */
["inventory_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ResolverInputTypes["inventory_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: ResolverInputTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["inventory_stream_cursor_value_input"]: {
	film_id?: ResolverInputTypes["smallint"] | undefined | null,
	inventory_id?: number | undefined | null,
	last_update?: ResolverInputTypes["timestamp"] | undefined | null,
	store_id?: ResolverInputTypes["smallint"] | undefined | null
};
	/** aggregate sum on columns */
["inventory_sum_fields"]: AliasType<{
	film_id?:boolean | `@${string}`,
	inventory_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** update columns of table "inventory" */
["inventory_update_column"]:inventory_update_column;
	["inventory_updates"]: {
	/** increments the numeric columns with given value of the filtered values */
	_inc?: ResolverInputTypes["inventory_inc_input"] | undefined | null,
	/** sets the columns of the filtered rows to the given values */
	_set?: ResolverInputTypes["inventory_set_input"] | undefined | null,
	/** filter the rows which have to be updated */
	where: ResolverInputTypes["inventory_bool_exp"]
};
	/** aggregate var_pop on columns */
["inventory_var_pop_fields"]: AliasType<{
	film_id?:boolean | `@${string}`,
	inventory_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_samp on columns */
["inventory_var_samp_fields"]: AliasType<{
	film_id?:boolean | `@${string}`,
	inventory_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate variance on columns */
["inventory_variance_fields"]: AliasType<{
	film_id?:boolean | `@${string}`,
	inventory_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** columns and relationships of "language" */
["language"]: AliasType<{
	language_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
	name?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregated selection of "language" */
["language_aggregate"]: AliasType<{
	aggregate?:ResolverInputTypes["language_aggregate_fields"],
	nodes?:ResolverInputTypes["language"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate fields of "language" */
["language_aggregate_fields"]: AliasType<{
	avg?:ResolverInputTypes["language_avg_fields"],
count?: [{	columns?: Array<ResolverInputTypes["language_select_column"]> | undefined | null,	distinct?: boolean | undefined | null},boolean | `@${string}`],
	max?:ResolverInputTypes["language_max_fields"],
	min?:ResolverInputTypes["language_min_fields"],
	stddev?:ResolverInputTypes["language_stddev_fields"],
	stddev_pop?:ResolverInputTypes["language_stddev_pop_fields"],
	stddev_samp?:ResolverInputTypes["language_stddev_samp_fields"],
	sum?:ResolverInputTypes["language_sum_fields"],
	var_pop?:ResolverInputTypes["language_var_pop_fields"],
	var_samp?:ResolverInputTypes["language_var_samp_fields"],
	variance?:ResolverInputTypes["language_variance_fields"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate avg on columns */
["language_avg_fields"]: AliasType<{
	language_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Boolean expression to filter rows from the table "language". All fields are combined with a logical 'AND'. */
["language_bool_exp"]: {
	_and?: Array<ResolverInputTypes["language_bool_exp"]> | undefined | null,
	_not?: ResolverInputTypes["language_bool_exp"] | undefined | null,
	_or?: Array<ResolverInputTypes["language_bool_exp"]> | undefined | null,
	language_id?: ResolverInputTypes["Int_comparison_exp"] | undefined | null,
	last_update?: ResolverInputTypes["timestamp_comparison_exp"] | undefined | null,
	name?: ResolverInputTypes["bpchar_comparison_exp"] | undefined | null
};
	/** unique or primary key constraints on table "language" */
["language_constraint"]:language_constraint;
	/** input type for incrementing numeric columns in table "language" */
["language_inc_input"]: {
	language_id?: number | undefined | null
};
	/** input type for inserting data into table "language" */
["language_insert_input"]: {
	language_id?: number | undefined | null,
	last_update?: ResolverInputTypes["timestamp"] | undefined | null,
	name?: ResolverInputTypes["bpchar"] | undefined | null
};
	/** aggregate max on columns */
["language_max_fields"]: AliasType<{
	language_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
	name?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate min on columns */
["language_min_fields"]: AliasType<{
	language_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
	name?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** response of any mutation on the table "language" */
["language_mutation_response"]: AliasType<{
	/** number of rows affected by the mutation */
	affected_rows?:boolean | `@${string}`,
	/** data from the rows affected by the mutation */
	returning?:ResolverInputTypes["language"],
		__typename?: boolean | `@${string}`
}>;
	/** on_conflict condition type for table "language" */
["language_on_conflict"]: {
	constraint: ResolverInputTypes["language_constraint"],
	update_columns: Array<ResolverInputTypes["language_update_column"]>,
	where?: ResolverInputTypes["language_bool_exp"] | undefined | null
};
	/** Ordering options when selecting data from "language". */
["language_order_by"]: {
	language_id?: ResolverInputTypes["order_by"] | undefined | null,
	last_update?: ResolverInputTypes["order_by"] | undefined | null,
	name?: ResolverInputTypes["order_by"] | undefined | null
};
	/** primary key columns input for table: language */
["language_pk_columns_input"]: {
	language_id: number
};
	/** select columns of table "language" */
["language_select_column"]:language_select_column;
	/** input type for updating data in table "language" */
["language_set_input"]: {
	language_id?: number | undefined | null,
	last_update?: ResolverInputTypes["timestamp"] | undefined | null,
	name?: ResolverInputTypes["bpchar"] | undefined | null
};
	/** aggregate stddev on columns */
["language_stddev_fields"]: AliasType<{
	language_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_pop on columns */
["language_stddev_pop_fields"]: AliasType<{
	language_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_samp on columns */
["language_stddev_samp_fields"]: AliasType<{
	language_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Streaming cursor of the table "language" */
["language_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ResolverInputTypes["language_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: ResolverInputTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["language_stream_cursor_value_input"]: {
	language_id?: number | undefined | null,
	last_update?: ResolverInputTypes["timestamp"] | undefined | null,
	name?: ResolverInputTypes["bpchar"] | undefined | null
};
	/** aggregate sum on columns */
["language_sum_fields"]: AliasType<{
	language_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** update columns of table "language" */
["language_update_column"]:language_update_column;
	["language_updates"]: {
	/** increments the numeric columns with given value of the filtered values */
	_inc?: ResolverInputTypes["language_inc_input"] | undefined | null,
	/** sets the columns of the filtered rows to the given values */
	_set?: ResolverInputTypes["language_set_input"] | undefined | null,
	/** filter the rows which have to be updated */
	where: ResolverInputTypes["language_bool_exp"]
};
	/** aggregate var_pop on columns */
["language_var_pop_fields"]: AliasType<{
	language_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_samp on columns */
["language_var_samp_fields"]: AliasType<{
	language_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate variance on columns */
["language_variance_fields"]: AliasType<{
	language_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	["mpaa_rating"]:unknown;
	/** Boolean expression to compare columns of type "mpaa_rating". All fields are combined with logical 'AND'. */
["mpaa_rating_comparison_exp"]: {
	_eq?: ResolverInputTypes["mpaa_rating"] | undefined | null,
	_gt?: ResolverInputTypes["mpaa_rating"] | undefined | null,
	_gte?: ResolverInputTypes["mpaa_rating"] | undefined | null,
	_in?: Array<ResolverInputTypes["mpaa_rating"]> | undefined | null,
	_is_null?: boolean | undefined | null,
	_lt?: ResolverInputTypes["mpaa_rating"] | undefined | null,
	_lte?: ResolverInputTypes["mpaa_rating"] | undefined | null,
	_neq?: ResolverInputTypes["mpaa_rating"] | undefined | null,
	_nin?: Array<ResolverInputTypes["mpaa_rating"]> | undefined | null
};
	/** mutation root */
["mutation_root"]: AliasType<{
delete_actor?: [{	/** filter the rows which have to be deleted */
	where: ResolverInputTypes["actor_bool_exp"]},ResolverInputTypes["actor_mutation_response"]],
delete_actor_by_pk?: [{	actor_id: number},ResolverInputTypes["actor"]],
delete_address?: [{	/** filter the rows which have to be deleted */
	where: ResolverInputTypes["address_bool_exp"]},ResolverInputTypes["address_mutation_response"]],
delete_address_by_pk?: [{	address_id: number},ResolverInputTypes["address"]],
delete_category?: [{	/** filter the rows which have to be deleted */
	where: ResolverInputTypes["category_bool_exp"]},ResolverInputTypes["category_mutation_response"]],
delete_category_by_pk?: [{	category_id: number},ResolverInputTypes["category"]],
delete_city?: [{	/** filter the rows which have to be deleted */
	where: ResolverInputTypes["city_bool_exp"]},ResolverInputTypes["city_mutation_response"]],
delete_city_by_pk?: [{	city_id: number},ResolverInputTypes["city"]],
delete_country?: [{	/** filter the rows which have to be deleted */
	where: ResolverInputTypes["country_bool_exp"]},ResolverInputTypes["country_mutation_response"]],
delete_country_by_pk?: [{	country_id: number},ResolverInputTypes["country"]],
delete_customer?: [{	/** filter the rows which have to be deleted */
	where: ResolverInputTypes["customer_bool_exp"]},ResolverInputTypes["customer_mutation_response"]],
delete_customer_by_pk?: [{	customer_id: number},ResolverInputTypes["customer"]],
delete_film?: [{	/** filter the rows which have to be deleted */
	where: ResolverInputTypes["film_bool_exp"]},ResolverInputTypes["film_mutation_response"]],
delete_film_actor?: [{	/** filter the rows which have to be deleted */
	where: ResolverInputTypes["film_actor_bool_exp"]},ResolverInputTypes["film_actor_mutation_response"]],
delete_film_actor_by_pk?: [{	actor_id: ResolverInputTypes["smallint"],	film_id: ResolverInputTypes["smallint"]},ResolverInputTypes["film_actor"]],
delete_film_by_pk?: [{	film_id: number},ResolverInputTypes["film"]],
delete_film_category?: [{	/** filter the rows which have to be deleted */
	where: ResolverInputTypes["film_category_bool_exp"]},ResolverInputTypes["film_category_mutation_response"]],
delete_film_category_by_pk?: [{	category_id: ResolverInputTypes["smallint"],	film_id: ResolverInputTypes["smallint"]},ResolverInputTypes["film_category"]],
delete_inventory?: [{	/** filter the rows which have to be deleted */
	where: ResolverInputTypes["inventory_bool_exp"]},ResolverInputTypes["inventory_mutation_response"]],
delete_inventory_by_pk?: [{	inventory_id: number},ResolverInputTypes["inventory"]],
delete_language?: [{	/** filter the rows which have to be deleted */
	where: ResolverInputTypes["language_bool_exp"]},ResolverInputTypes["language_mutation_response"]],
delete_language_by_pk?: [{	language_id: number},ResolverInputTypes["language"]],
delete_payment?: [{	/** filter the rows which have to be deleted */
	where: ResolverInputTypes["payment_bool_exp"]},ResolverInputTypes["payment_mutation_response"]],
delete_payment_by_pk?: [{	payment_id: number},ResolverInputTypes["payment"]],
delete_rental?: [{	/** filter the rows which have to be deleted */
	where: ResolverInputTypes["rental_bool_exp"]},ResolverInputTypes["rental_mutation_response"]],
delete_rental_by_pk?: [{	rental_id: number},ResolverInputTypes["rental"]],
delete_staff?: [{	/** filter the rows which have to be deleted */
	where: ResolverInputTypes["staff_bool_exp"]},ResolverInputTypes["staff_mutation_response"]],
delete_staff_by_pk?: [{	staff_id: number},ResolverInputTypes["staff"]],
delete_store?: [{	/** filter the rows which have to be deleted */
	where: ResolverInputTypes["store_bool_exp"]},ResolverInputTypes["store_mutation_response"]],
delete_store_by_pk?: [{	store_id: number},ResolverInputTypes["store"]],
insert_actor?: [{	/** the rows to be inserted */
	objects: Array<ResolverInputTypes["actor_insert_input"]>,	/** upsert condition */
	on_conflict?: ResolverInputTypes["actor_on_conflict"] | undefined | null},ResolverInputTypes["actor_mutation_response"]],
insert_actor_one?: [{	/** the row to be inserted */
	object: ResolverInputTypes["actor_insert_input"],	/** upsert condition */
	on_conflict?: ResolverInputTypes["actor_on_conflict"] | undefined | null},ResolverInputTypes["actor"]],
insert_address?: [{	/** the rows to be inserted */
	objects: Array<ResolverInputTypes["address_insert_input"]>,	/** upsert condition */
	on_conflict?: ResolverInputTypes["address_on_conflict"] | undefined | null},ResolverInputTypes["address_mutation_response"]],
insert_address_one?: [{	/** the row to be inserted */
	object: ResolverInputTypes["address_insert_input"],	/** upsert condition */
	on_conflict?: ResolverInputTypes["address_on_conflict"] | undefined | null},ResolverInputTypes["address"]],
insert_category?: [{	/** the rows to be inserted */
	objects: Array<ResolverInputTypes["category_insert_input"]>,	/** upsert condition */
	on_conflict?: ResolverInputTypes["category_on_conflict"] | undefined | null},ResolverInputTypes["category_mutation_response"]],
insert_category_one?: [{	/** the row to be inserted */
	object: ResolverInputTypes["category_insert_input"],	/** upsert condition */
	on_conflict?: ResolverInputTypes["category_on_conflict"] | undefined | null},ResolverInputTypes["category"]],
insert_city?: [{	/** the rows to be inserted */
	objects: Array<ResolverInputTypes["city_insert_input"]>,	/** upsert condition */
	on_conflict?: ResolverInputTypes["city_on_conflict"] | undefined | null},ResolverInputTypes["city_mutation_response"]],
insert_city_one?: [{	/** the row to be inserted */
	object: ResolverInputTypes["city_insert_input"],	/** upsert condition */
	on_conflict?: ResolverInputTypes["city_on_conflict"] | undefined | null},ResolverInputTypes["city"]],
insert_country?: [{	/** the rows to be inserted */
	objects: Array<ResolverInputTypes["country_insert_input"]>,	/** upsert condition */
	on_conflict?: ResolverInputTypes["country_on_conflict"] | undefined | null},ResolverInputTypes["country_mutation_response"]],
insert_country_one?: [{	/** the row to be inserted */
	object: ResolverInputTypes["country_insert_input"],	/** upsert condition */
	on_conflict?: ResolverInputTypes["country_on_conflict"] | undefined | null},ResolverInputTypes["country"]],
insert_customer?: [{	/** the rows to be inserted */
	objects: Array<ResolverInputTypes["customer_insert_input"]>,	/** upsert condition */
	on_conflict?: ResolverInputTypes["customer_on_conflict"] | undefined | null},ResolverInputTypes["customer_mutation_response"]],
insert_customer_one?: [{	/** the row to be inserted */
	object: ResolverInputTypes["customer_insert_input"],	/** upsert condition */
	on_conflict?: ResolverInputTypes["customer_on_conflict"] | undefined | null},ResolverInputTypes["customer"]],
insert_film?: [{	/** the rows to be inserted */
	objects: Array<ResolverInputTypes["film_insert_input"]>,	/** upsert condition */
	on_conflict?: ResolverInputTypes["film_on_conflict"] | undefined | null},ResolverInputTypes["film_mutation_response"]],
insert_film_actor?: [{	/** the rows to be inserted */
	objects: Array<ResolverInputTypes["film_actor_insert_input"]>,	/** upsert condition */
	on_conflict?: ResolverInputTypes["film_actor_on_conflict"] | undefined | null},ResolverInputTypes["film_actor_mutation_response"]],
insert_film_actor_one?: [{	/** the row to be inserted */
	object: ResolverInputTypes["film_actor_insert_input"],	/** upsert condition */
	on_conflict?: ResolverInputTypes["film_actor_on_conflict"] | undefined | null},ResolverInputTypes["film_actor"]],
insert_film_category?: [{	/** the rows to be inserted */
	objects: Array<ResolverInputTypes["film_category_insert_input"]>,	/** upsert condition */
	on_conflict?: ResolverInputTypes["film_category_on_conflict"] | undefined | null},ResolverInputTypes["film_category_mutation_response"]],
insert_film_category_one?: [{	/** the row to be inserted */
	object: ResolverInputTypes["film_category_insert_input"],	/** upsert condition */
	on_conflict?: ResolverInputTypes["film_category_on_conflict"] | undefined | null},ResolverInputTypes["film_category"]],
insert_film_one?: [{	/** the row to be inserted */
	object: ResolverInputTypes["film_insert_input"],	/** upsert condition */
	on_conflict?: ResolverInputTypes["film_on_conflict"] | undefined | null},ResolverInputTypes["film"]],
insert_inventory?: [{	/** the rows to be inserted */
	objects: Array<ResolverInputTypes["inventory_insert_input"]>,	/** upsert condition */
	on_conflict?: ResolverInputTypes["inventory_on_conflict"] | undefined | null},ResolverInputTypes["inventory_mutation_response"]],
insert_inventory_one?: [{	/** the row to be inserted */
	object: ResolverInputTypes["inventory_insert_input"],	/** upsert condition */
	on_conflict?: ResolverInputTypes["inventory_on_conflict"] | undefined | null},ResolverInputTypes["inventory"]],
insert_language?: [{	/** the rows to be inserted */
	objects: Array<ResolverInputTypes["language_insert_input"]>,	/** upsert condition */
	on_conflict?: ResolverInputTypes["language_on_conflict"] | undefined | null},ResolverInputTypes["language_mutation_response"]],
insert_language_one?: [{	/** the row to be inserted */
	object: ResolverInputTypes["language_insert_input"],	/** upsert condition */
	on_conflict?: ResolverInputTypes["language_on_conflict"] | undefined | null},ResolverInputTypes["language"]],
insert_payment?: [{	/** the rows to be inserted */
	objects: Array<ResolverInputTypes["payment_insert_input"]>,	/** upsert condition */
	on_conflict?: ResolverInputTypes["payment_on_conflict"] | undefined | null},ResolverInputTypes["payment_mutation_response"]],
insert_payment_one?: [{	/** the row to be inserted */
	object: ResolverInputTypes["payment_insert_input"],	/** upsert condition */
	on_conflict?: ResolverInputTypes["payment_on_conflict"] | undefined | null},ResolverInputTypes["payment"]],
insert_rental?: [{	/** the rows to be inserted */
	objects: Array<ResolverInputTypes["rental_insert_input"]>,	/** upsert condition */
	on_conflict?: ResolverInputTypes["rental_on_conflict"] | undefined | null},ResolverInputTypes["rental_mutation_response"]],
insert_rental_one?: [{	/** the row to be inserted */
	object: ResolverInputTypes["rental_insert_input"],	/** upsert condition */
	on_conflict?: ResolverInputTypes["rental_on_conflict"] | undefined | null},ResolverInputTypes["rental"]],
insert_staff?: [{	/** the rows to be inserted */
	objects: Array<ResolverInputTypes["staff_insert_input"]>,	/** upsert condition */
	on_conflict?: ResolverInputTypes["staff_on_conflict"] | undefined | null},ResolverInputTypes["staff_mutation_response"]],
insert_staff_one?: [{	/** the row to be inserted */
	object: ResolverInputTypes["staff_insert_input"],	/** upsert condition */
	on_conflict?: ResolverInputTypes["staff_on_conflict"] | undefined | null},ResolverInputTypes["staff"]],
insert_store?: [{	/** the rows to be inserted */
	objects: Array<ResolverInputTypes["store_insert_input"]>,	/** upsert condition */
	on_conflict?: ResolverInputTypes["store_on_conflict"] | undefined | null},ResolverInputTypes["store_mutation_response"]],
insert_store_one?: [{	/** the row to be inserted */
	object: ResolverInputTypes["store_insert_input"],	/** upsert condition */
	on_conflict?: ResolverInputTypes["store_on_conflict"] | undefined | null},ResolverInputTypes["store"]],
update_actor?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ResolverInputTypes["actor_inc_input"] | undefined | null,	/** sets the columns of the filtered rows to the given values */
	_set?: ResolverInputTypes["actor_set_input"] | undefined | null,	/** filter the rows which have to be updated */
	where: ResolverInputTypes["actor_bool_exp"]},ResolverInputTypes["actor_mutation_response"]],
update_actor_by_pk?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ResolverInputTypes["actor_inc_input"] | undefined | null,	/** sets the columns of the filtered rows to the given values */
	_set?: ResolverInputTypes["actor_set_input"] | undefined | null,	pk_columns: ResolverInputTypes["actor_pk_columns_input"]},ResolverInputTypes["actor"]],
update_actor_many?: [{	/** updates to execute, in order */
	updates: Array<ResolverInputTypes["actor_updates"]>},ResolverInputTypes["actor_mutation_response"]],
update_address?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ResolverInputTypes["address_inc_input"] | undefined | null,	/** sets the columns of the filtered rows to the given values */
	_set?: ResolverInputTypes["address_set_input"] | undefined | null,	/** filter the rows which have to be updated */
	where: ResolverInputTypes["address_bool_exp"]},ResolverInputTypes["address_mutation_response"]],
update_address_by_pk?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ResolverInputTypes["address_inc_input"] | undefined | null,	/** sets the columns of the filtered rows to the given values */
	_set?: ResolverInputTypes["address_set_input"] | undefined | null,	pk_columns: ResolverInputTypes["address_pk_columns_input"]},ResolverInputTypes["address"]],
update_address_many?: [{	/** updates to execute, in order */
	updates: Array<ResolverInputTypes["address_updates"]>},ResolverInputTypes["address_mutation_response"]],
update_category?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ResolverInputTypes["category_inc_input"] | undefined | null,	/** sets the columns of the filtered rows to the given values */
	_set?: ResolverInputTypes["category_set_input"] | undefined | null,	/** filter the rows which have to be updated */
	where: ResolverInputTypes["category_bool_exp"]},ResolverInputTypes["category_mutation_response"]],
update_category_by_pk?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ResolverInputTypes["category_inc_input"] | undefined | null,	/** sets the columns of the filtered rows to the given values */
	_set?: ResolverInputTypes["category_set_input"] | undefined | null,	pk_columns: ResolverInputTypes["category_pk_columns_input"]},ResolverInputTypes["category"]],
update_category_many?: [{	/** updates to execute, in order */
	updates: Array<ResolverInputTypes["category_updates"]>},ResolverInputTypes["category_mutation_response"]],
update_city?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ResolverInputTypes["city_inc_input"] | undefined | null,	/** sets the columns of the filtered rows to the given values */
	_set?: ResolverInputTypes["city_set_input"] | undefined | null,	/** filter the rows which have to be updated */
	where: ResolverInputTypes["city_bool_exp"]},ResolverInputTypes["city_mutation_response"]],
update_city_by_pk?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ResolverInputTypes["city_inc_input"] | undefined | null,	/** sets the columns of the filtered rows to the given values */
	_set?: ResolverInputTypes["city_set_input"] | undefined | null,	pk_columns: ResolverInputTypes["city_pk_columns_input"]},ResolverInputTypes["city"]],
update_city_many?: [{	/** updates to execute, in order */
	updates: Array<ResolverInputTypes["city_updates"]>},ResolverInputTypes["city_mutation_response"]],
update_country?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ResolverInputTypes["country_inc_input"] | undefined | null,	/** sets the columns of the filtered rows to the given values */
	_set?: ResolverInputTypes["country_set_input"] | undefined | null,	/** filter the rows which have to be updated */
	where: ResolverInputTypes["country_bool_exp"]},ResolverInputTypes["country_mutation_response"]],
update_country_by_pk?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ResolverInputTypes["country_inc_input"] | undefined | null,	/** sets the columns of the filtered rows to the given values */
	_set?: ResolverInputTypes["country_set_input"] | undefined | null,	pk_columns: ResolverInputTypes["country_pk_columns_input"]},ResolverInputTypes["country"]],
update_country_many?: [{	/** updates to execute, in order */
	updates: Array<ResolverInputTypes["country_updates"]>},ResolverInputTypes["country_mutation_response"]],
update_customer?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ResolverInputTypes["customer_inc_input"] | undefined | null,	/** sets the columns of the filtered rows to the given values */
	_set?: ResolverInputTypes["customer_set_input"] | undefined | null,	/** filter the rows which have to be updated */
	where: ResolverInputTypes["customer_bool_exp"]},ResolverInputTypes["customer_mutation_response"]],
update_customer_by_pk?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ResolverInputTypes["customer_inc_input"] | undefined | null,	/** sets the columns of the filtered rows to the given values */
	_set?: ResolverInputTypes["customer_set_input"] | undefined | null,	pk_columns: ResolverInputTypes["customer_pk_columns_input"]},ResolverInputTypes["customer"]],
update_customer_many?: [{	/** updates to execute, in order */
	updates: Array<ResolverInputTypes["customer_updates"]>},ResolverInputTypes["customer_mutation_response"]],
update_film?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ResolverInputTypes["film_inc_input"] | undefined | null,	/** sets the columns of the filtered rows to the given values */
	_set?: ResolverInputTypes["film_set_input"] | undefined | null,	/** filter the rows which have to be updated */
	where: ResolverInputTypes["film_bool_exp"]},ResolverInputTypes["film_mutation_response"]],
update_film_actor?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ResolverInputTypes["film_actor_inc_input"] | undefined | null,	/** sets the columns of the filtered rows to the given values */
	_set?: ResolverInputTypes["film_actor_set_input"] | undefined | null,	/** filter the rows which have to be updated */
	where: ResolverInputTypes["film_actor_bool_exp"]},ResolverInputTypes["film_actor_mutation_response"]],
update_film_actor_by_pk?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ResolverInputTypes["film_actor_inc_input"] | undefined | null,	/** sets the columns of the filtered rows to the given values */
	_set?: ResolverInputTypes["film_actor_set_input"] | undefined | null,	pk_columns: ResolverInputTypes["film_actor_pk_columns_input"]},ResolverInputTypes["film_actor"]],
update_film_actor_many?: [{	/** updates to execute, in order */
	updates: Array<ResolverInputTypes["film_actor_updates"]>},ResolverInputTypes["film_actor_mutation_response"]],
update_film_by_pk?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ResolverInputTypes["film_inc_input"] | undefined | null,	/** sets the columns of the filtered rows to the given values */
	_set?: ResolverInputTypes["film_set_input"] | undefined | null,	pk_columns: ResolverInputTypes["film_pk_columns_input"]},ResolverInputTypes["film"]],
update_film_category?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ResolverInputTypes["film_category_inc_input"] | undefined | null,	/** sets the columns of the filtered rows to the given values */
	_set?: ResolverInputTypes["film_category_set_input"] | undefined | null,	/** filter the rows which have to be updated */
	where: ResolverInputTypes["film_category_bool_exp"]},ResolverInputTypes["film_category_mutation_response"]],
update_film_category_by_pk?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ResolverInputTypes["film_category_inc_input"] | undefined | null,	/** sets the columns of the filtered rows to the given values */
	_set?: ResolverInputTypes["film_category_set_input"] | undefined | null,	pk_columns: ResolverInputTypes["film_category_pk_columns_input"]},ResolverInputTypes["film_category"]],
update_film_category_many?: [{	/** updates to execute, in order */
	updates: Array<ResolverInputTypes["film_category_updates"]>},ResolverInputTypes["film_category_mutation_response"]],
update_film_many?: [{	/** updates to execute, in order */
	updates: Array<ResolverInputTypes["film_updates"]>},ResolverInputTypes["film_mutation_response"]],
update_inventory?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ResolverInputTypes["inventory_inc_input"] | undefined | null,	/** sets the columns of the filtered rows to the given values */
	_set?: ResolverInputTypes["inventory_set_input"] | undefined | null,	/** filter the rows which have to be updated */
	where: ResolverInputTypes["inventory_bool_exp"]},ResolverInputTypes["inventory_mutation_response"]],
update_inventory_by_pk?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ResolverInputTypes["inventory_inc_input"] | undefined | null,	/** sets the columns of the filtered rows to the given values */
	_set?: ResolverInputTypes["inventory_set_input"] | undefined | null,	pk_columns: ResolverInputTypes["inventory_pk_columns_input"]},ResolverInputTypes["inventory"]],
update_inventory_many?: [{	/** updates to execute, in order */
	updates: Array<ResolverInputTypes["inventory_updates"]>},ResolverInputTypes["inventory_mutation_response"]],
update_language?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ResolverInputTypes["language_inc_input"] | undefined | null,	/** sets the columns of the filtered rows to the given values */
	_set?: ResolverInputTypes["language_set_input"] | undefined | null,	/** filter the rows which have to be updated */
	where: ResolverInputTypes["language_bool_exp"]},ResolverInputTypes["language_mutation_response"]],
update_language_by_pk?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ResolverInputTypes["language_inc_input"] | undefined | null,	/** sets the columns of the filtered rows to the given values */
	_set?: ResolverInputTypes["language_set_input"] | undefined | null,	pk_columns: ResolverInputTypes["language_pk_columns_input"]},ResolverInputTypes["language"]],
update_language_many?: [{	/** updates to execute, in order */
	updates: Array<ResolverInputTypes["language_updates"]>},ResolverInputTypes["language_mutation_response"]],
update_payment?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ResolverInputTypes["payment_inc_input"] | undefined | null,	/** sets the columns of the filtered rows to the given values */
	_set?: ResolverInputTypes["payment_set_input"] | undefined | null,	/** filter the rows which have to be updated */
	where: ResolverInputTypes["payment_bool_exp"]},ResolverInputTypes["payment_mutation_response"]],
update_payment_by_pk?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ResolverInputTypes["payment_inc_input"] | undefined | null,	/** sets the columns of the filtered rows to the given values */
	_set?: ResolverInputTypes["payment_set_input"] | undefined | null,	pk_columns: ResolverInputTypes["payment_pk_columns_input"]},ResolverInputTypes["payment"]],
update_payment_many?: [{	/** updates to execute, in order */
	updates: Array<ResolverInputTypes["payment_updates"]>},ResolverInputTypes["payment_mutation_response"]],
update_rental?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ResolverInputTypes["rental_inc_input"] | undefined | null,	/** sets the columns of the filtered rows to the given values */
	_set?: ResolverInputTypes["rental_set_input"] | undefined | null,	/** filter the rows which have to be updated */
	where: ResolverInputTypes["rental_bool_exp"]},ResolverInputTypes["rental_mutation_response"]],
update_rental_by_pk?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ResolverInputTypes["rental_inc_input"] | undefined | null,	/** sets the columns of the filtered rows to the given values */
	_set?: ResolverInputTypes["rental_set_input"] | undefined | null,	pk_columns: ResolverInputTypes["rental_pk_columns_input"]},ResolverInputTypes["rental"]],
update_rental_many?: [{	/** updates to execute, in order */
	updates: Array<ResolverInputTypes["rental_updates"]>},ResolverInputTypes["rental_mutation_response"]],
update_staff?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ResolverInputTypes["staff_inc_input"] | undefined | null,	/** sets the columns of the filtered rows to the given values */
	_set?: ResolverInputTypes["staff_set_input"] | undefined | null,	/** filter the rows which have to be updated */
	where: ResolverInputTypes["staff_bool_exp"]},ResolverInputTypes["staff_mutation_response"]],
update_staff_by_pk?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ResolverInputTypes["staff_inc_input"] | undefined | null,	/** sets the columns of the filtered rows to the given values */
	_set?: ResolverInputTypes["staff_set_input"] | undefined | null,	pk_columns: ResolverInputTypes["staff_pk_columns_input"]},ResolverInputTypes["staff"]],
update_staff_many?: [{	/** updates to execute, in order */
	updates: Array<ResolverInputTypes["staff_updates"]>},ResolverInputTypes["staff_mutation_response"]],
update_store?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ResolverInputTypes["store_inc_input"] | undefined | null,	/** sets the columns of the filtered rows to the given values */
	_set?: ResolverInputTypes["store_set_input"] | undefined | null,	/** filter the rows which have to be updated */
	where: ResolverInputTypes["store_bool_exp"]},ResolverInputTypes["store_mutation_response"]],
update_store_by_pk?: [{	/** increments the numeric columns with given value of the filtered values */
	_inc?: ResolverInputTypes["store_inc_input"] | undefined | null,	/** sets the columns of the filtered rows to the given values */
	_set?: ResolverInputTypes["store_set_input"] | undefined | null,	pk_columns: ResolverInputTypes["store_pk_columns_input"]},ResolverInputTypes["store"]],
update_store_many?: [{	/** updates to execute, in order */
	updates: Array<ResolverInputTypes["store_updates"]>},ResolverInputTypes["store_mutation_response"]],
		__typename?: boolean | `@${string}`
}>;
	/** columns and relationships of "nicer_but_slower_film_list" */
["nicer_but_slower_film_list"]: AliasType<{
	actors?:boolean | `@${string}`,
	category?:boolean | `@${string}`,
	description?:boolean | `@${string}`,
	fid?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	price?:boolean | `@${string}`,
	rating?:boolean | `@${string}`,
	title?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregated selection of "nicer_but_slower_film_list" */
["nicer_but_slower_film_list_aggregate"]: AliasType<{
	aggregate?:ResolverInputTypes["nicer_but_slower_film_list_aggregate_fields"],
	nodes?:ResolverInputTypes["nicer_but_slower_film_list"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate fields of "nicer_but_slower_film_list" */
["nicer_but_slower_film_list_aggregate_fields"]: AliasType<{
	avg?:ResolverInputTypes["nicer_but_slower_film_list_avg_fields"],
count?: [{	columns?: Array<ResolverInputTypes["nicer_but_slower_film_list_select_column"]> | undefined | null,	distinct?: boolean | undefined | null},boolean | `@${string}`],
	max?:ResolverInputTypes["nicer_but_slower_film_list_max_fields"],
	min?:ResolverInputTypes["nicer_but_slower_film_list_min_fields"],
	stddev?:ResolverInputTypes["nicer_but_slower_film_list_stddev_fields"],
	stddev_pop?:ResolverInputTypes["nicer_but_slower_film_list_stddev_pop_fields"],
	stddev_samp?:ResolverInputTypes["nicer_but_slower_film_list_stddev_samp_fields"],
	sum?:ResolverInputTypes["nicer_but_slower_film_list_sum_fields"],
	var_pop?:ResolverInputTypes["nicer_but_slower_film_list_var_pop_fields"],
	var_samp?:ResolverInputTypes["nicer_but_slower_film_list_var_samp_fields"],
	variance?:ResolverInputTypes["nicer_but_slower_film_list_variance_fields"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate avg on columns */
["nicer_but_slower_film_list_avg_fields"]: AliasType<{
	fid?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	price?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Boolean expression to filter rows from the table "nicer_but_slower_film_list". All fields are combined with a logical 'AND'. */
["nicer_but_slower_film_list_bool_exp"]: {
	_and?: Array<ResolverInputTypes["nicer_but_slower_film_list_bool_exp"]> | undefined | null,
	_not?: ResolverInputTypes["nicer_but_slower_film_list_bool_exp"] | undefined | null,
	_or?: Array<ResolverInputTypes["nicer_but_slower_film_list_bool_exp"]> | undefined | null,
	actors?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
	category?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
	description?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
	fid?: ResolverInputTypes["Int_comparison_exp"] | undefined | null,
	length?: ResolverInputTypes["smallint_comparison_exp"] | undefined | null,
	price?: ResolverInputTypes["numeric_comparison_exp"] | undefined | null,
	rating?: ResolverInputTypes["mpaa_rating_comparison_exp"] | undefined | null,
	title?: ResolverInputTypes["String_comparison_exp"] | undefined | null
};
	/** aggregate max on columns */
["nicer_but_slower_film_list_max_fields"]: AliasType<{
	actors?:boolean | `@${string}`,
	category?:boolean | `@${string}`,
	description?:boolean | `@${string}`,
	fid?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	price?:boolean | `@${string}`,
	rating?:boolean | `@${string}`,
	title?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate min on columns */
["nicer_but_slower_film_list_min_fields"]: AliasType<{
	actors?:boolean | `@${string}`,
	category?:boolean | `@${string}`,
	description?:boolean | `@${string}`,
	fid?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	price?:boolean | `@${string}`,
	rating?:boolean | `@${string}`,
	title?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Ordering options when selecting data from "nicer_but_slower_film_list". */
["nicer_but_slower_film_list_order_by"]: {
	actors?: ResolverInputTypes["order_by"] | undefined | null,
	category?: ResolverInputTypes["order_by"] | undefined | null,
	description?: ResolverInputTypes["order_by"] | undefined | null,
	fid?: ResolverInputTypes["order_by"] | undefined | null,
	length?: ResolverInputTypes["order_by"] | undefined | null,
	price?: ResolverInputTypes["order_by"] | undefined | null,
	rating?: ResolverInputTypes["order_by"] | undefined | null,
	title?: ResolverInputTypes["order_by"] | undefined | null
};
	/** select columns of table "nicer_but_slower_film_list" */
["nicer_but_slower_film_list_select_column"]:nicer_but_slower_film_list_select_column;
	/** aggregate stddev on columns */
["nicer_but_slower_film_list_stddev_fields"]: AliasType<{
	fid?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	price?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_pop on columns */
["nicer_but_slower_film_list_stddev_pop_fields"]: AliasType<{
	fid?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	price?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_samp on columns */
["nicer_but_slower_film_list_stddev_samp_fields"]: AliasType<{
	fid?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	price?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Streaming cursor of the table "nicer_but_slower_film_list" */
["nicer_but_slower_film_list_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ResolverInputTypes["nicer_but_slower_film_list_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: ResolverInputTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["nicer_but_slower_film_list_stream_cursor_value_input"]: {
	actors?: string | undefined | null,
	category?: string | undefined | null,
	description?: string | undefined | null,
	fid?: number | undefined | null,
	length?: ResolverInputTypes["smallint"] | undefined | null,
	price?: ResolverInputTypes["numeric"] | undefined | null,
	rating?: ResolverInputTypes["mpaa_rating"] | undefined | null,
	title?: string | undefined | null
};
	/** aggregate sum on columns */
["nicer_but_slower_film_list_sum_fields"]: AliasType<{
	fid?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	price?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_pop on columns */
["nicer_but_slower_film_list_var_pop_fields"]: AliasType<{
	fid?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	price?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_samp on columns */
["nicer_but_slower_film_list_var_samp_fields"]: AliasType<{
	fid?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	price?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate variance on columns */
["nicer_but_slower_film_list_variance_fields"]: AliasType<{
	fid?:boolean | `@${string}`,
	length?:boolean | `@${string}`,
	price?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	["numeric"]:unknown;
	/** Boolean expression to compare columns of type "numeric". All fields are combined with logical 'AND'. */
["numeric_comparison_exp"]: {
	_eq?: ResolverInputTypes["numeric"] | undefined | null,
	_gt?: ResolverInputTypes["numeric"] | undefined | null,
	_gte?: ResolverInputTypes["numeric"] | undefined | null,
	_in?: Array<ResolverInputTypes["numeric"]> | undefined | null,
	_is_null?: boolean | undefined | null,
	_lt?: ResolverInputTypes["numeric"] | undefined | null,
	_lte?: ResolverInputTypes["numeric"] | undefined | null,
	_neq?: ResolverInputTypes["numeric"] | undefined | null,
	_nin?: Array<ResolverInputTypes["numeric"]> | undefined | null
};
	/** column ordering options */
["order_by"]:order_by;
	/** columns and relationships of "payment" */
["payment"]: AliasType<{
	amount?:boolean | `@${string}`,
	customer_id?:boolean | `@${string}`,
	payment_date?:boolean | `@${string}`,
	payment_id?:boolean | `@${string}`,
	rental_id?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregated selection of "payment" */
["payment_aggregate"]: AliasType<{
	aggregate?:ResolverInputTypes["payment_aggregate_fields"],
	nodes?:ResolverInputTypes["payment"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate fields of "payment" */
["payment_aggregate_fields"]: AliasType<{
	avg?:ResolverInputTypes["payment_avg_fields"],
count?: [{	columns?: Array<ResolverInputTypes["payment_select_column"]> | undefined | null,	distinct?: boolean | undefined | null},boolean | `@${string}`],
	max?:ResolverInputTypes["payment_max_fields"],
	min?:ResolverInputTypes["payment_min_fields"],
	stddev?:ResolverInputTypes["payment_stddev_fields"],
	stddev_pop?:ResolverInputTypes["payment_stddev_pop_fields"],
	stddev_samp?:ResolverInputTypes["payment_stddev_samp_fields"],
	sum?:ResolverInputTypes["payment_sum_fields"],
	var_pop?:ResolverInputTypes["payment_var_pop_fields"],
	var_samp?:ResolverInputTypes["payment_var_samp_fields"],
	variance?:ResolverInputTypes["payment_variance_fields"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate avg on columns */
["payment_avg_fields"]: AliasType<{
	amount?:boolean | `@${string}`,
	customer_id?:boolean | `@${string}`,
	payment_id?:boolean | `@${string}`,
	rental_id?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Boolean expression to filter rows from the table "payment". All fields are combined with a logical 'AND'. */
["payment_bool_exp"]: {
	_and?: Array<ResolverInputTypes["payment_bool_exp"]> | undefined | null,
	_not?: ResolverInputTypes["payment_bool_exp"] | undefined | null,
	_or?: Array<ResolverInputTypes["payment_bool_exp"]> | undefined | null,
	amount?: ResolverInputTypes["numeric_comparison_exp"] | undefined | null,
	customer_id?: ResolverInputTypes["smallint_comparison_exp"] | undefined | null,
	payment_date?: ResolverInputTypes["timestamp_comparison_exp"] | undefined | null,
	payment_id?: ResolverInputTypes["Int_comparison_exp"] | undefined | null,
	rental_id?: ResolverInputTypes["Int_comparison_exp"] | undefined | null,
	staff_id?: ResolverInputTypes["smallint_comparison_exp"] | undefined | null
};
	/** unique or primary key constraints on table "payment" */
["payment_constraint"]:payment_constraint;
	/** input type for incrementing numeric columns in table "payment" */
["payment_inc_input"]: {
	amount?: ResolverInputTypes["numeric"] | undefined | null,
	customer_id?: ResolverInputTypes["smallint"] | undefined | null,
	payment_id?: number | undefined | null,
	rental_id?: number | undefined | null,
	staff_id?: ResolverInputTypes["smallint"] | undefined | null
};
	/** input type for inserting data into table "payment" */
["payment_insert_input"]: {
	amount?: ResolverInputTypes["numeric"] | undefined | null,
	customer_id?: ResolverInputTypes["smallint"] | undefined | null,
	payment_date?: ResolverInputTypes["timestamp"] | undefined | null,
	payment_id?: number | undefined | null,
	rental_id?: number | undefined | null,
	staff_id?: ResolverInputTypes["smallint"] | undefined | null
};
	/** aggregate max on columns */
["payment_max_fields"]: AliasType<{
	amount?:boolean | `@${string}`,
	customer_id?:boolean | `@${string}`,
	payment_date?:boolean | `@${string}`,
	payment_id?:boolean | `@${string}`,
	rental_id?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate min on columns */
["payment_min_fields"]: AliasType<{
	amount?:boolean | `@${string}`,
	customer_id?:boolean | `@${string}`,
	payment_date?:boolean | `@${string}`,
	payment_id?:boolean | `@${string}`,
	rental_id?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** response of any mutation on the table "payment" */
["payment_mutation_response"]: AliasType<{
	/** number of rows affected by the mutation */
	affected_rows?:boolean | `@${string}`,
	/** data from the rows affected by the mutation */
	returning?:ResolverInputTypes["payment"],
		__typename?: boolean | `@${string}`
}>;
	/** on_conflict condition type for table "payment" */
["payment_on_conflict"]: {
	constraint: ResolverInputTypes["payment_constraint"],
	update_columns: Array<ResolverInputTypes["payment_update_column"]>,
	where?: ResolverInputTypes["payment_bool_exp"] | undefined | null
};
	/** Ordering options when selecting data from "payment". */
["payment_order_by"]: {
	amount?: ResolverInputTypes["order_by"] | undefined | null,
	customer_id?: ResolverInputTypes["order_by"] | undefined | null,
	payment_date?: ResolverInputTypes["order_by"] | undefined | null,
	payment_id?: ResolverInputTypes["order_by"] | undefined | null,
	rental_id?: ResolverInputTypes["order_by"] | undefined | null,
	staff_id?: ResolverInputTypes["order_by"] | undefined | null
};
	/** primary key columns input for table: payment */
["payment_pk_columns_input"]: {
	payment_id: number
};
	/** select columns of table "payment" */
["payment_select_column"]:payment_select_column;
	/** input type for updating data in table "payment" */
["payment_set_input"]: {
	amount?: ResolverInputTypes["numeric"] | undefined | null,
	customer_id?: ResolverInputTypes["smallint"] | undefined | null,
	payment_date?: ResolverInputTypes["timestamp"] | undefined | null,
	payment_id?: number | undefined | null,
	rental_id?: number | undefined | null,
	staff_id?: ResolverInputTypes["smallint"] | undefined | null
};
	/** aggregate stddev on columns */
["payment_stddev_fields"]: AliasType<{
	amount?:boolean | `@${string}`,
	customer_id?:boolean | `@${string}`,
	payment_id?:boolean | `@${string}`,
	rental_id?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_pop on columns */
["payment_stddev_pop_fields"]: AliasType<{
	amount?:boolean | `@${string}`,
	customer_id?:boolean | `@${string}`,
	payment_id?:boolean | `@${string}`,
	rental_id?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_samp on columns */
["payment_stddev_samp_fields"]: AliasType<{
	amount?:boolean | `@${string}`,
	customer_id?:boolean | `@${string}`,
	payment_id?:boolean | `@${string}`,
	rental_id?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Streaming cursor of the table "payment" */
["payment_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ResolverInputTypes["payment_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: ResolverInputTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["payment_stream_cursor_value_input"]: {
	amount?: ResolverInputTypes["numeric"] | undefined | null,
	customer_id?: ResolverInputTypes["smallint"] | undefined | null,
	payment_date?: ResolverInputTypes["timestamp"] | undefined | null,
	payment_id?: number | undefined | null,
	rental_id?: number | undefined | null,
	staff_id?: ResolverInputTypes["smallint"] | undefined | null
};
	/** aggregate sum on columns */
["payment_sum_fields"]: AliasType<{
	amount?:boolean | `@${string}`,
	customer_id?:boolean | `@${string}`,
	payment_id?:boolean | `@${string}`,
	rental_id?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** update columns of table "payment" */
["payment_update_column"]:payment_update_column;
	["payment_updates"]: {
	/** increments the numeric columns with given value of the filtered values */
	_inc?: ResolverInputTypes["payment_inc_input"] | undefined | null,
	/** sets the columns of the filtered rows to the given values */
	_set?: ResolverInputTypes["payment_set_input"] | undefined | null,
	/** filter the rows which have to be updated */
	where: ResolverInputTypes["payment_bool_exp"]
};
	/** aggregate var_pop on columns */
["payment_var_pop_fields"]: AliasType<{
	amount?:boolean | `@${string}`,
	customer_id?:boolean | `@${string}`,
	payment_id?:boolean | `@${string}`,
	rental_id?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_samp on columns */
["payment_var_samp_fields"]: AliasType<{
	amount?:boolean | `@${string}`,
	customer_id?:boolean | `@${string}`,
	payment_id?:boolean | `@${string}`,
	rental_id?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate variance on columns */
["payment_variance_fields"]: AliasType<{
	amount?:boolean | `@${string}`,
	customer_id?:boolean | `@${string}`,
	payment_id?:boolean | `@${string}`,
	rental_id?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	["query_root"]: AliasType<{
actor?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["actor_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["actor_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["actor_bool_exp"] | undefined | null},ResolverInputTypes["actor"]],
actor_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["actor_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["actor_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["actor_bool_exp"] | undefined | null},ResolverInputTypes["actor_aggregate"]],
actor_by_pk?: [{	actor_id: number},ResolverInputTypes["actor"]],
actor_info?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["actor_info_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["actor_info_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["actor_info_bool_exp"] | undefined | null},ResolverInputTypes["actor_info"]],
actor_info_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["actor_info_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["actor_info_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["actor_info_bool_exp"] | undefined | null},ResolverInputTypes["actor_info_aggregate"]],
address?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["address_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["address_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["address_bool_exp"] | undefined | null},ResolverInputTypes["address"]],
address_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["address_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["address_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["address_bool_exp"] | undefined | null},ResolverInputTypes["address_aggregate"]],
address_by_pk?: [{	address_id: number},ResolverInputTypes["address"]],
category?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["category_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["category_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["category_bool_exp"] | undefined | null},ResolverInputTypes["category"]],
category_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["category_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["category_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["category_bool_exp"] | undefined | null},ResolverInputTypes["category_aggregate"]],
category_by_pk?: [{	category_id: number},ResolverInputTypes["category"]],
city?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["city_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["city_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["city_bool_exp"] | undefined | null},ResolverInputTypes["city"]],
city_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["city_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["city_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["city_bool_exp"] | undefined | null},ResolverInputTypes["city_aggregate"]],
city_by_pk?: [{	city_id: number},ResolverInputTypes["city"]],
country?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["country_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["country_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["country_bool_exp"] | undefined | null},ResolverInputTypes["country"]],
country_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["country_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["country_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["country_bool_exp"] | undefined | null},ResolverInputTypes["country_aggregate"]],
country_by_pk?: [{	country_id: number},ResolverInputTypes["country"]],
customer?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["customer_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["customer_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["customer_bool_exp"] | undefined | null},ResolverInputTypes["customer"]],
customer_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["customer_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["customer_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["customer_bool_exp"] | undefined | null},ResolverInputTypes["customer_aggregate"]],
customer_by_pk?: [{	customer_id: number},ResolverInputTypes["customer"]],
customer_list?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["customer_list_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["customer_list_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["customer_list_bool_exp"] | undefined | null},ResolverInputTypes["customer_list"]],
customer_list_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["customer_list_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["customer_list_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["customer_list_bool_exp"] | undefined | null},ResolverInputTypes["customer_list_aggregate"]],
film?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["film_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["film_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["film_bool_exp"] | undefined | null},ResolverInputTypes["film"]],
film_actor?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["film_actor_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["film_actor_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["film_actor_bool_exp"] | undefined | null},ResolverInputTypes["film_actor"]],
film_actor_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["film_actor_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["film_actor_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["film_actor_bool_exp"] | undefined | null},ResolverInputTypes["film_actor_aggregate"]],
film_actor_by_pk?: [{	actor_id: ResolverInputTypes["smallint"],	film_id: ResolverInputTypes["smallint"]},ResolverInputTypes["film_actor"]],
film_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["film_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["film_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["film_bool_exp"] | undefined | null},ResolverInputTypes["film_aggregate"]],
film_by_pk?: [{	film_id: number},ResolverInputTypes["film"]],
film_category?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["film_category_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["film_category_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["film_category_bool_exp"] | undefined | null},ResolverInputTypes["film_category"]],
film_category_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["film_category_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["film_category_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["film_category_bool_exp"] | undefined | null},ResolverInputTypes["film_category_aggregate"]],
film_category_by_pk?: [{	category_id: ResolverInputTypes["smallint"],	film_id: ResolverInputTypes["smallint"]},ResolverInputTypes["film_category"]],
film_list?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["film_list_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["film_list_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["film_list_bool_exp"] | undefined | null},ResolverInputTypes["film_list"]],
film_list_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["film_list_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["film_list_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["film_list_bool_exp"] | undefined | null},ResolverInputTypes["film_list_aggregate"]],
inventory?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["inventory_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["inventory_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["inventory_bool_exp"] | undefined | null},ResolverInputTypes["inventory"]],
inventory_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["inventory_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["inventory_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["inventory_bool_exp"] | undefined | null},ResolverInputTypes["inventory_aggregate"]],
inventory_by_pk?: [{	inventory_id: number},ResolverInputTypes["inventory"]],
language?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["language_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["language_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["language_bool_exp"] | undefined | null},ResolverInputTypes["language"]],
language_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["language_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["language_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["language_bool_exp"] | undefined | null},ResolverInputTypes["language_aggregate"]],
language_by_pk?: [{	language_id: number},ResolverInputTypes["language"]],
nicer_but_slower_film_list?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["nicer_but_slower_film_list_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["nicer_but_slower_film_list_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["nicer_but_slower_film_list_bool_exp"] | undefined | null},ResolverInputTypes["nicer_but_slower_film_list"]],
nicer_but_slower_film_list_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["nicer_but_slower_film_list_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["nicer_but_slower_film_list_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["nicer_but_slower_film_list_bool_exp"] | undefined | null},ResolverInputTypes["nicer_but_slower_film_list_aggregate"]],
payment?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["payment_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["payment_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["payment_bool_exp"] | undefined | null},ResolverInputTypes["payment"]],
payment_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["payment_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["payment_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["payment_bool_exp"] | undefined | null},ResolverInputTypes["payment_aggregate"]],
payment_by_pk?: [{	payment_id: number},ResolverInputTypes["payment"]],
rental?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["rental_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["rental_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["rental_bool_exp"] | undefined | null},ResolverInputTypes["rental"]],
rental_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["rental_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["rental_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["rental_bool_exp"] | undefined | null},ResolverInputTypes["rental_aggregate"]],
rental_by_pk?: [{	rental_id: number},ResolverInputTypes["rental"]],
sales_by_film_category?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["sales_by_film_category_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["sales_by_film_category_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["sales_by_film_category_bool_exp"] | undefined | null},ResolverInputTypes["sales_by_film_category"]],
sales_by_film_category_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["sales_by_film_category_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["sales_by_film_category_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["sales_by_film_category_bool_exp"] | undefined | null},ResolverInputTypes["sales_by_film_category_aggregate"]],
sales_by_store?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["sales_by_store_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["sales_by_store_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["sales_by_store_bool_exp"] | undefined | null},ResolverInputTypes["sales_by_store"]],
sales_by_store_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["sales_by_store_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["sales_by_store_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["sales_by_store_bool_exp"] | undefined | null},ResolverInputTypes["sales_by_store_aggregate"]],
staff?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["staff_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["staff_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["staff_bool_exp"] | undefined | null},ResolverInputTypes["staff"]],
staff_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["staff_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["staff_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["staff_bool_exp"] | undefined | null},ResolverInputTypes["staff_aggregate"]],
staff_by_pk?: [{	staff_id: number},ResolverInputTypes["staff"]],
staff_list?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["staff_list_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["staff_list_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["staff_list_bool_exp"] | undefined | null},ResolverInputTypes["staff_list"]],
staff_list_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["staff_list_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["staff_list_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["staff_list_bool_exp"] | undefined | null},ResolverInputTypes["staff_list_aggregate"]],
store?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["store_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["store_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["store_bool_exp"] | undefined | null},ResolverInputTypes["store"]],
store_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["store_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["store_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["store_bool_exp"] | undefined | null},ResolverInputTypes["store_aggregate"]],
store_by_pk?: [{	store_id: number},ResolverInputTypes["store"]],
		__typename?: boolean | `@${string}`
}>;
	/** columns and relationships of "rental" */
["rental"]: AliasType<{
	customer_id?:boolean | `@${string}`,
	inventory_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
	rental_date?:boolean | `@${string}`,
	rental_id?:boolean | `@${string}`,
	return_date?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregated selection of "rental" */
["rental_aggregate"]: AliasType<{
	aggregate?:ResolverInputTypes["rental_aggregate_fields"],
	nodes?:ResolverInputTypes["rental"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate fields of "rental" */
["rental_aggregate_fields"]: AliasType<{
	avg?:ResolverInputTypes["rental_avg_fields"],
count?: [{	columns?: Array<ResolverInputTypes["rental_select_column"]> | undefined | null,	distinct?: boolean | undefined | null},boolean | `@${string}`],
	max?:ResolverInputTypes["rental_max_fields"],
	min?:ResolverInputTypes["rental_min_fields"],
	stddev?:ResolverInputTypes["rental_stddev_fields"],
	stddev_pop?:ResolverInputTypes["rental_stddev_pop_fields"],
	stddev_samp?:ResolverInputTypes["rental_stddev_samp_fields"],
	sum?:ResolverInputTypes["rental_sum_fields"],
	var_pop?:ResolverInputTypes["rental_var_pop_fields"],
	var_samp?:ResolverInputTypes["rental_var_samp_fields"],
	variance?:ResolverInputTypes["rental_variance_fields"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate avg on columns */
["rental_avg_fields"]: AliasType<{
	customer_id?:boolean | `@${string}`,
	inventory_id?:boolean | `@${string}`,
	rental_id?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Boolean expression to filter rows from the table "rental". All fields are combined with a logical 'AND'. */
["rental_bool_exp"]: {
	_and?: Array<ResolverInputTypes["rental_bool_exp"]> | undefined | null,
	_not?: ResolverInputTypes["rental_bool_exp"] | undefined | null,
	_or?: Array<ResolverInputTypes["rental_bool_exp"]> | undefined | null,
	customer_id?: ResolverInputTypes["smallint_comparison_exp"] | undefined | null,
	inventory_id?: ResolverInputTypes["Int_comparison_exp"] | undefined | null,
	last_update?: ResolverInputTypes["timestamp_comparison_exp"] | undefined | null,
	rental_date?: ResolverInputTypes["timestamp_comparison_exp"] | undefined | null,
	rental_id?: ResolverInputTypes["Int_comparison_exp"] | undefined | null,
	return_date?: ResolverInputTypes["timestamp_comparison_exp"] | undefined | null,
	staff_id?: ResolverInputTypes["smallint_comparison_exp"] | undefined | null
};
	/** unique or primary key constraints on table "rental" */
["rental_constraint"]:rental_constraint;
	/** input type for incrementing numeric columns in table "rental" */
["rental_inc_input"]: {
	customer_id?: ResolverInputTypes["smallint"] | undefined | null,
	inventory_id?: number | undefined | null,
	rental_id?: number | undefined | null,
	staff_id?: ResolverInputTypes["smallint"] | undefined | null
};
	/** input type for inserting data into table "rental" */
["rental_insert_input"]: {
	customer_id?: ResolverInputTypes["smallint"] | undefined | null,
	inventory_id?: number | undefined | null,
	last_update?: ResolverInputTypes["timestamp"] | undefined | null,
	rental_date?: ResolverInputTypes["timestamp"] | undefined | null,
	rental_id?: number | undefined | null,
	return_date?: ResolverInputTypes["timestamp"] | undefined | null,
	staff_id?: ResolverInputTypes["smallint"] | undefined | null
};
	/** aggregate max on columns */
["rental_max_fields"]: AliasType<{
	customer_id?:boolean | `@${string}`,
	inventory_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
	rental_date?:boolean | `@${string}`,
	rental_id?:boolean | `@${string}`,
	return_date?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate min on columns */
["rental_min_fields"]: AliasType<{
	customer_id?:boolean | `@${string}`,
	inventory_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
	rental_date?:boolean | `@${string}`,
	rental_id?:boolean | `@${string}`,
	return_date?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** response of any mutation on the table "rental" */
["rental_mutation_response"]: AliasType<{
	/** number of rows affected by the mutation */
	affected_rows?:boolean | `@${string}`,
	/** data from the rows affected by the mutation */
	returning?:ResolverInputTypes["rental"],
		__typename?: boolean | `@${string}`
}>;
	/** on_conflict condition type for table "rental" */
["rental_on_conflict"]: {
	constraint: ResolverInputTypes["rental_constraint"],
	update_columns: Array<ResolverInputTypes["rental_update_column"]>,
	where?: ResolverInputTypes["rental_bool_exp"] | undefined | null
};
	/** Ordering options when selecting data from "rental". */
["rental_order_by"]: {
	customer_id?: ResolverInputTypes["order_by"] | undefined | null,
	inventory_id?: ResolverInputTypes["order_by"] | undefined | null,
	last_update?: ResolverInputTypes["order_by"] | undefined | null,
	rental_date?: ResolverInputTypes["order_by"] | undefined | null,
	rental_id?: ResolverInputTypes["order_by"] | undefined | null,
	return_date?: ResolverInputTypes["order_by"] | undefined | null,
	staff_id?: ResolverInputTypes["order_by"] | undefined | null
};
	/** primary key columns input for table: rental */
["rental_pk_columns_input"]: {
	rental_id: number
};
	/** select columns of table "rental" */
["rental_select_column"]:rental_select_column;
	/** input type for updating data in table "rental" */
["rental_set_input"]: {
	customer_id?: ResolverInputTypes["smallint"] | undefined | null,
	inventory_id?: number | undefined | null,
	last_update?: ResolverInputTypes["timestamp"] | undefined | null,
	rental_date?: ResolverInputTypes["timestamp"] | undefined | null,
	rental_id?: number | undefined | null,
	return_date?: ResolverInputTypes["timestamp"] | undefined | null,
	staff_id?: ResolverInputTypes["smallint"] | undefined | null
};
	/** aggregate stddev on columns */
["rental_stddev_fields"]: AliasType<{
	customer_id?:boolean | `@${string}`,
	inventory_id?:boolean | `@${string}`,
	rental_id?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_pop on columns */
["rental_stddev_pop_fields"]: AliasType<{
	customer_id?:boolean | `@${string}`,
	inventory_id?:boolean | `@${string}`,
	rental_id?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_samp on columns */
["rental_stddev_samp_fields"]: AliasType<{
	customer_id?:boolean | `@${string}`,
	inventory_id?:boolean | `@${string}`,
	rental_id?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Streaming cursor of the table "rental" */
["rental_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ResolverInputTypes["rental_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: ResolverInputTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["rental_stream_cursor_value_input"]: {
	customer_id?: ResolverInputTypes["smallint"] | undefined | null,
	inventory_id?: number | undefined | null,
	last_update?: ResolverInputTypes["timestamp"] | undefined | null,
	rental_date?: ResolverInputTypes["timestamp"] | undefined | null,
	rental_id?: number | undefined | null,
	return_date?: ResolverInputTypes["timestamp"] | undefined | null,
	staff_id?: ResolverInputTypes["smallint"] | undefined | null
};
	/** aggregate sum on columns */
["rental_sum_fields"]: AliasType<{
	customer_id?:boolean | `@${string}`,
	inventory_id?:boolean | `@${string}`,
	rental_id?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** update columns of table "rental" */
["rental_update_column"]:rental_update_column;
	["rental_updates"]: {
	/** increments the numeric columns with given value of the filtered values */
	_inc?: ResolverInputTypes["rental_inc_input"] | undefined | null,
	/** sets the columns of the filtered rows to the given values */
	_set?: ResolverInputTypes["rental_set_input"] | undefined | null,
	/** filter the rows which have to be updated */
	where: ResolverInputTypes["rental_bool_exp"]
};
	/** aggregate var_pop on columns */
["rental_var_pop_fields"]: AliasType<{
	customer_id?:boolean | `@${string}`,
	inventory_id?:boolean | `@${string}`,
	rental_id?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_samp on columns */
["rental_var_samp_fields"]: AliasType<{
	customer_id?:boolean | `@${string}`,
	inventory_id?:boolean | `@${string}`,
	rental_id?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate variance on columns */
["rental_variance_fields"]: AliasType<{
	customer_id?:boolean | `@${string}`,
	inventory_id?:boolean | `@${string}`,
	rental_id?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** columns and relationships of "sales_by_film_category" */
["sales_by_film_category"]: AliasType<{
	category?:boolean | `@${string}`,
	total_sales?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregated selection of "sales_by_film_category" */
["sales_by_film_category_aggregate"]: AliasType<{
	aggregate?:ResolverInputTypes["sales_by_film_category_aggregate_fields"],
	nodes?:ResolverInputTypes["sales_by_film_category"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate fields of "sales_by_film_category" */
["sales_by_film_category_aggregate_fields"]: AliasType<{
	avg?:ResolverInputTypes["sales_by_film_category_avg_fields"],
count?: [{	columns?: Array<ResolverInputTypes["sales_by_film_category_select_column"]> | undefined | null,	distinct?: boolean | undefined | null},boolean | `@${string}`],
	max?:ResolverInputTypes["sales_by_film_category_max_fields"],
	min?:ResolverInputTypes["sales_by_film_category_min_fields"],
	stddev?:ResolverInputTypes["sales_by_film_category_stddev_fields"],
	stddev_pop?:ResolverInputTypes["sales_by_film_category_stddev_pop_fields"],
	stddev_samp?:ResolverInputTypes["sales_by_film_category_stddev_samp_fields"],
	sum?:ResolverInputTypes["sales_by_film_category_sum_fields"],
	var_pop?:ResolverInputTypes["sales_by_film_category_var_pop_fields"],
	var_samp?:ResolverInputTypes["sales_by_film_category_var_samp_fields"],
	variance?:ResolverInputTypes["sales_by_film_category_variance_fields"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate avg on columns */
["sales_by_film_category_avg_fields"]: AliasType<{
	total_sales?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Boolean expression to filter rows from the table "sales_by_film_category". All fields are combined with a logical 'AND'. */
["sales_by_film_category_bool_exp"]: {
	_and?: Array<ResolverInputTypes["sales_by_film_category_bool_exp"]> | undefined | null,
	_not?: ResolverInputTypes["sales_by_film_category_bool_exp"] | undefined | null,
	_or?: Array<ResolverInputTypes["sales_by_film_category_bool_exp"]> | undefined | null,
	category?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
	total_sales?: ResolverInputTypes["numeric_comparison_exp"] | undefined | null
};
	/** aggregate max on columns */
["sales_by_film_category_max_fields"]: AliasType<{
	category?:boolean | `@${string}`,
	total_sales?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate min on columns */
["sales_by_film_category_min_fields"]: AliasType<{
	category?:boolean | `@${string}`,
	total_sales?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Ordering options when selecting data from "sales_by_film_category". */
["sales_by_film_category_order_by"]: {
	category?: ResolverInputTypes["order_by"] | undefined | null,
	total_sales?: ResolverInputTypes["order_by"] | undefined | null
};
	/** select columns of table "sales_by_film_category" */
["sales_by_film_category_select_column"]:sales_by_film_category_select_column;
	/** aggregate stddev on columns */
["sales_by_film_category_stddev_fields"]: AliasType<{
	total_sales?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_pop on columns */
["sales_by_film_category_stddev_pop_fields"]: AliasType<{
	total_sales?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_samp on columns */
["sales_by_film_category_stddev_samp_fields"]: AliasType<{
	total_sales?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Streaming cursor of the table "sales_by_film_category" */
["sales_by_film_category_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ResolverInputTypes["sales_by_film_category_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: ResolverInputTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["sales_by_film_category_stream_cursor_value_input"]: {
	category?: string | undefined | null,
	total_sales?: ResolverInputTypes["numeric"] | undefined | null
};
	/** aggregate sum on columns */
["sales_by_film_category_sum_fields"]: AliasType<{
	total_sales?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_pop on columns */
["sales_by_film_category_var_pop_fields"]: AliasType<{
	total_sales?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_samp on columns */
["sales_by_film_category_var_samp_fields"]: AliasType<{
	total_sales?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate variance on columns */
["sales_by_film_category_variance_fields"]: AliasType<{
	total_sales?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** columns and relationships of "sales_by_store" */
["sales_by_store"]: AliasType<{
	manager?:boolean | `@${string}`,
	store?:boolean | `@${string}`,
	total_sales?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregated selection of "sales_by_store" */
["sales_by_store_aggregate"]: AliasType<{
	aggregate?:ResolverInputTypes["sales_by_store_aggregate_fields"],
	nodes?:ResolverInputTypes["sales_by_store"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate fields of "sales_by_store" */
["sales_by_store_aggregate_fields"]: AliasType<{
	avg?:ResolverInputTypes["sales_by_store_avg_fields"],
count?: [{	columns?: Array<ResolverInputTypes["sales_by_store_select_column"]> | undefined | null,	distinct?: boolean | undefined | null},boolean | `@${string}`],
	max?:ResolverInputTypes["sales_by_store_max_fields"],
	min?:ResolverInputTypes["sales_by_store_min_fields"],
	stddev?:ResolverInputTypes["sales_by_store_stddev_fields"],
	stddev_pop?:ResolverInputTypes["sales_by_store_stddev_pop_fields"],
	stddev_samp?:ResolverInputTypes["sales_by_store_stddev_samp_fields"],
	sum?:ResolverInputTypes["sales_by_store_sum_fields"],
	var_pop?:ResolverInputTypes["sales_by_store_var_pop_fields"],
	var_samp?:ResolverInputTypes["sales_by_store_var_samp_fields"],
	variance?:ResolverInputTypes["sales_by_store_variance_fields"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate avg on columns */
["sales_by_store_avg_fields"]: AliasType<{
	total_sales?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Boolean expression to filter rows from the table "sales_by_store". All fields are combined with a logical 'AND'. */
["sales_by_store_bool_exp"]: {
	_and?: Array<ResolverInputTypes["sales_by_store_bool_exp"]> | undefined | null,
	_not?: ResolverInputTypes["sales_by_store_bool_exp"] | undefined | null,
	_or?: Array<ResolverInputTypes["sales_by_store_bool_exp"]> | undefined | null,
	manager?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
	store?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
	total_sales?: ResolverInputTypes["numeric_comparison_exp"] | undefined | null
};
	/** aggregate max on columns */
["sales_by_store_max_fields"]: AliasType<{
	manager?:boolean | `@${string}`,
	store?:boolean | `@${string}`,
	total_sales?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate min on columns */
["sales_by_store_min_fields"]: AliasType<{
	manager?:boolean | `@${string}`,
	store?:boolean | `@${string}`,
	total_sales?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Ordering options when selecting data from "sales_by_store". */
["sales_by_store_order_by"]: {
	manager?: ResolverInputTypes["order_by"] | undefined | null,
	store?: ResolverInputTypes["order_by"] | undefined | null,
	total_sales?: ResolverInputTypes["order_by"] | undefined | null
};
	/** select columns of table "sales_by_store" */
["sales_by_store_select_column"]:sales_by_store_select_column;
	/** aggregate stddev on columns */
["sales_by_store_stddev_fields"]: AliasType<{
	total_sales?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_pop on columns */
["sales_by_store_stddev_pop_fields"]: AliasType<{
	total_sales?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_samp on columns */
["sales_by_store_stddev_samp_fields"]: AliasType<{
	total_sales?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Streaming cursor of the table "sales_by_store" */
["sales_by_store_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ResolverInputTypes["sales_by_store_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: ResolverInputTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["sales_by_store_stream_cursor_value_input"]: {
	manager?: string | undefined | null,
	store?: string | undefined | null,
	total_sales?: ResolverInputTypes["numeric"] | undefined | null
};
	/** aggregate sum on columns */
["sales_by_store_sum_fields"]: AliasType<{
	total_sales?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_pop on columns */
["sales_by_store_var_pop_fields"]: AliasType<{
	total_sales?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_samp on columns */
["sales_by_store_var_samp_fields"]: AliasType<{
	total_sales?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate variance on columns */
["sales_by_store_variance_fields"]: AliasType<{
	total_sales?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	["smallint"]:unknown;
	/** Boolean expression to compare columns of type "smallint". All fields are combined with logical 'AND'. */
["smallint_comparison_exp"]: {
	_eq?: ResolverInputTypes["smallint"] | undefined | null,
	_gt?: ResolverInputTypes["smallint"] | undefined | null,
	_gte?: ResolverInputTypes["smallint"] | undefined | null,
	_in?: Array<ResolverInputTypes["smallint"]> | undefined | null,
	_is_null?: boolean | undefined | null,
	_lt?: ResolverInputTypes["smallint"] | undefined | null,
	_lte?: ResolverInputTypes["smallint"] | undefined | null,
	_neq?: ResolverInputTypes["smallint"] | undefined | null,
	_nin?: Array<ResolverInputTypes["smallint"]> | undefined | null
};
	/** columns and relationships of "staff" */
["staff"]: AliasType<{
	active?:boolean | `@${string}`,
	address_id?:boolean | `@${string}`,
	email?:boolean | `@${string}`,
	first_name?:boolean | `@${string}`,
	last_name?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
	password?:boolean | `@${string}`,
	picture?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
	username?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregated selection of "staff" */
["staff_aggregate"]: AliasType<{
	aggregate?:ResolverInputTypes["staff_aggregate_fields"],
	nodes?:ResolverInputTypes["staff"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate fields of "staff" */
["staff_aggregate_fields"]: AliasType<{
	avg?:ResolverInputTypes["staff_avg_fields"],
count?: [{	columns?: Array<ResolverInputTypes["staff_select_column"]> | undefined | null,	distinct?: boolean | undefined | null},boolean | `@${string}`],
	max?:ResolverInputTypes["staff_max_fields"],
	min?:ResolverInputTypes["staff_min_fields"],
	stddev?:ResolverInputTypes["staff_stddev_fields"],
	stddev_pop?:ResolverInputTypes["staff_stddev_pop_fields"],
	stddev_samp?:ResolverInputTypes["staff_stddev_samp_fields"],
	sum?:ResolverInputTypes["staff_sum_fields"],
	var_pop?:ResolverInputTypes["staff_var_pop_fields"],
	var_samp?:ResolverInputTypes["staff_var_samp_fields"],
	variance?:ResolverInputTypes["staff_variance_fields"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate avg on columns */
["staff_avg_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Boolean expression to filter rows from the table "staff". All fields are combined with a logical 'AND'. */
["staff_bool_exp"]: {
	_and?: Array<ResolverInputTypes["staff_bool_exp"]> | undefined | null,
	_not?: ResolverInputTypes["staff_bool_exp"] | undefined | null,
	_or?: Array<ResolverInputTypes["staff_bool_exp"]> | undefined | null,
	active?: ResolverInputTypes["Boolean_comparison_exp"] | undefined | null,
	address_id?: ResolverInputTypes["smallint_comparison_exp"] | undefined | null,
	email?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
	first_name?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
	last_name?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
	last_update?: ResolverInputTypes["timestamp_comparison_exp"] | undefined | null,
	password?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
	picture?: ResolverInputTypes["bytea_comparison_exp"] | undefined | null,
	staff_id?: ResolverInputTypes["Int_comparison_exp"] | undefined | null,
	store_id?: ResolverInputTypes["smallint_comparison_exp"] | undefined | null,
	username?: ResolverInputTypes["String_comparison_exp"] | undefined | null
};
	/** unique or primary key constraints on table "staff" */
["staff_constraint"]:staff_constraint;
	/** input type for incrementing numeric columns in table "staff" */
["staff_inc_input"]: {
	address_id?: ResolverInputTypes["smallint"] | undefined | null,
	staff_id?: number | undefined | null,
	store_id?: ResolverInputTypes["smallint"] | undefined | null
};
	/** input type for inserting data into table "staff" */
["staff_insert_input"]: {
	active?: boolean | undefined | null,
	address_id?: ResolverInputTypes["smallint"] | undefined | null,
	email?: string | undefined | null,
	first_name?: string | undefined | null,
	last_name?: string | undefined | null,
	last_update?: ResolverInputTypes["timestamp"] | undefined | null,
	password?: string | undefined | null,
	picture?: ResolverInputTypes["bytea"] | undefined | null,
	staff_id?: number | undefined | null,
	store_id?: ResolverInputTypes["smallint"] | undefined | null,
	username?: string | undefined | null
};
	/** columns and relationships of "staff_list" */
["staff_list"]: AliasType<{
	address?:boolean | `@${string}`,
	city?:boolean | `@${string}`,
	country?:boolean | `@${string}`,
	id?:boolean | `@${string}`,
	name?:boolean | `@${string}`,
	phone?:boolean | `@${string}`,
	sid?:boolean | `@${string}`,
	zip_code?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregated selection of "staff_list" */
["staff_list_aggregate"]: AliasType<{
	aggregate?:ResolverInputTypes["staff_list_aggregate_fields"],
	nodes?:ResolverInputTypes["staff_list"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate fields of "staff_list" */
["staff_list_aggregate_fields"]: AliasType<{
	avg?:ResolverInputTypes["staff_list_avg_fields"],
count?: [{	columns?: Array<ResolverInputTypes["staff_list_select_column"]> | undefined | null,	distinct?: boolean | undefined | null},boolean | `@${string}`],
	max?:ResolverInputTypes["staff_list_max_fields"],
	min?:ResolverInputTypes["staff_list_min_fields"],
	stddev?:ResolverInputTypes["staff_list_stddev_fields"],
	stddev_pop?:ResolverInputTypes["staff_list_stddev_pop_fields"],
	stddev_samp?:ResolverInputTypes["staff_list_stddev_samp_fields"],
	sum?:ResolverInputTypes["staff_list_sum_fields"],
	var_pop?:ResolverInputTypes["staff_list_var_pop_fields"],
	var_samp?:ResolverInputTypes["staff_list_var_samp_fields"],
	variance?:ResolverInputTypes["staff_list_variance_fields"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate avg on columns */
["staff_list_avg_fields"]: AliasType<{
	id?:boolean | `@${string}`,
	sid?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Boolean expression to filter rows from the table "staff_list". All fields are combined with a logical 'AND'. */
["staff_list_bool_exp"]: {
	_and?: Array<ResolverInputTypes["staff_list_bool_exp"]> | undefined | null,
	_not?: ResolverInputTypes["staff_list_bool_exp"] | undefined | null,
	_or?: Array<ResolverInputTypes["staff_list_bool_exp"]> | undefined | null,
	address?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
	city?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
	country?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
	id?: ResolverInputTypes["Int_comparison_exp"] | undefined | null,
	name?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
	phone?: ResolverInputTypes["String_comparison_exp"] | undefined | null,
	sid?: ResolverInputTypes["smallint_comparison_exp"] | undefined | null,
	zip_code?: ResolverInputTypes["String_comparison_exp"] | undefined | null
};
	/** aggregate max on columns */
["staff_list_max_fields"]: AliasType<{
	address?:boolean | `@${string}`,
	city?:boolean | `@${string}`,
	country?:boolean | `@${string}`,
	id?:boolean | `@${string}`,
	name?:boolean | `@${string}`,
	phone?:boolean | `@${string}`,
	sid?:boolean | `@${string}`,
	zip_code?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate min on columns */
["staff_list_min_fields"]: AliasType<{
	address?:boolean | `@${string}`,
	city?:boolean | `@${string}`,
	country?:boolean | `@${string}`,
	id?:boolean | `@${string}`,
	name?:boolean | `@${string}`,
	phone?:boolean | `@${string}`,
	sid?:boolean | `@${string}`,
	zip_code?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Ordering options when selecting data from "staff_list". */
["staff_list_order_by"]: {
	address?: ResolverInputTypes["order_by"] | undefined | null,
	city?: ResolverInputTypes["order_by"] | undefined | null,
	country?: ResolverInputTypes["order_by"] | undefined | null,
	id?: ResolverInputTypes["order_by"] | undefined | null,
	name?: ResolverInputTypes["order_by"] | undefined | null,
	phone?: ResolverInputTypes["order_by"] | undefined | null,
	sid?: ResolverInputTypes["order_by"] | undefined | null,
	zip_code?: ResolverInputTypes["order_by"] | undefined | null
};
	/** select columns of table "staff_list" */
["staff_list_select_column"]:staff_list_select_column;
	/** aggregate stddev on columns */
["staff_list_stddev_fields"]: AliasType<{
	id?:boolean | `@${string}`,
	sid?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_pop on columns */
["staff_list_stddev_pop_fields"]: AliasType<{
	id?:boolean | `@${string}`,
	sid?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_samp on columns */
["staff_list_stddev_samp_fields"]: AliasType<{
	id?:boolean | `@${string}`,
	sid?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Streaming cursor of the table "staff_list" */
["staff_list_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ResolverInputTypes["staff_list_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: ResolverInputTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["staff_list_stream_cursor_value_input"]: {
	address?: string | undefined | null,
	city?: string | undefined | null,
	country?: string | undefined | null,
	id?: number | undefined | null,
	name?: string | undefined | null,
	phone?: string | undefined | null,
	sid?: ResolverInputTypes["smallint"] | undefined | null,
	zip_code?: string | undefined | null
};
	/** aggregate sum on columns */
["staff_list_sum_fields"]: AliasType<{
	id?:boolean | `@${string}`,
	sid?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_pop on columns */
["staff_list_var_pop_fields"]: AliasType<{
	id?:boolean | `@${string}`,
	sid?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_samp on columns */
["staff_list_var_samp_fields"]: AliasType<{
	id?:boolean | `@${string}`,
	sid?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate variance on columns */
["staff_list_variance_fields"]: AliasType<{
	id?:boolean | `@${string}`,
	sid?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate max on columns */
["staff_max_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	email?:boolean | `@${string}`,
	first_name?:boolean | `@${string}`,
	last_name?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
	password?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
	username?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate min on columns */
["staff_min_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	email?:boolean | `@${string}`,
	first_name?:boolean | `@${string}`,
	last_name?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
	password?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
	username?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** response of any mutation on the table "staff" */
["staff_mutation_response"]: AliasType<{
	/** number of rows affected by the mutation */
	affected_rows?:boolean | `@${string}`,
	/** data from the rows affected by the mutation */
	returning?:ResolverInputTypes["staff"],
		__typename?: boolean | `@${string}`
}>;
	/** on_conflict condition type for table "staff" */
["staff_on_conflict"]: {
	constraint: ResolverInputTypes["staff_constraint"],
	update_columns: Array<ResolverInputTypes["staff_update_column"]>,
	where?: ResolverInputTypes["staff_bool_exp"] | undefined | null
};
	/** Ordering options when selecting data from "staff". */
["staff_order_by"]: {
	active?: ResolverInputTypes["order_by"] | undefined | null,
	address_id?: ResolverInputTypes["order_by"] | undefined | null,
	email?: ResolverInputTypes["order_by"] | undefined | null,
	first_name?: ResolverInputTypes["order_by"] | undefined | null,
	last_name?: ResolverInputTypes["order_by"] | undefined | null,
	last_update?: ResolverInputTypes["order_by"] | undefined | null,
	password?: ResolverInputTypes["order_by"] | undefined | null,
	picture?: ResolverInputTypes["order_by"] | undefined | null,
	staff_id?: ResolverInputTypes["order_by"] | undefined | null,
	store_id?: ResolverInputTypes["order_by"] | undefined | null,
	username?: ResolverInputTypes["order_by"] | undefined | null
};
	/** primary key columns input for table: staff */
["staff_pk_columns_input"]: {
	staff_id: number
};
	/** select columns of table "staff" */
["staff_select_column"]:staff_select_column;
	/** input type for updating data in table "staff" */
["staff_set_input"]: {
	active?: boolean | undefined | null,
	address_id?: ResolverInputTypes["smallint"] | undefined | null,
	email?: string | undefined | null,
	first_name?: string | undefined | null,
	last_name?: string | undefined | null,
	last_update?: ResolverInputTypes["timestamp"] | undefined | null,
	password?: string | undefined | null,
	picture?: ResolverInputTypes["bytea"] | undefined | null,
	staff_id?: number | undefined | null,
	store_id?: ResolverInputTypes["smallint"] | undefined | null,
	username?: string | undefined | null
};
	/** aggregate stddev on columns */
["staff_stddev_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_pop on columns */
["staff_stddev_pop_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_samp on columns */
["staff_stddev_samp_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Streaming cursor of the table "staff" */
["staff_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ResolverInputTypes["staff_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: ResolverInputTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["staff_stream_cursor_value_input"]: {
	active?: boolean | undefined | null,
	address_id?: ResolverInputTypes["smallint"] | undefined | null,
	email?: string | undefined | null,
	first_name?: string | undefined | null,
	last_name?: string | undefined | null,
	last_update?: ResolverInputTypes["timestamp"] | undefined | null,
	password?: string | undefined | null,
	picture?: ResolverInputTypes["bytea"] | undefined | null,
	staff_id?: number | undefined | null,
	store_id?: ResolverInputTypes["smallint"] | undefined | null,
	username?: string | undefined | null
};
	/** aggregate sum on columns */
["staff_sum_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** update columns of table "staff" */
["staff_update_column"]:staff_update_column;
	["staff_updates"]: {
	/** increments the numeric columns with given value of the filtered values */
	_inc?: ResolverInputTypes["staff_inc_input"] | undefined | null,
	/** sets the columns of the filtered rows to the given values */
	_set?: ResolverInputTypes["staff_set_input"] | undefined | null,
	/** filter the rows which have to be updated */
	where: ResolverInputTypes["staff_bool_exp"]
};
	/** aggregate var_pop on columns */
["staff_var_pop_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_samp on columns */
["staff_var_samp_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate variance on columns */
["staff_variance_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	staff_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** columns and relationships of "store" */
["store"]: AliasType<{
	address_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
	manager_staff_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregated selection of "store" */
["store_aggregate"]: AliasType<{
	aggregate?:ResolverInputTypes["store_aggregate_fields"],
	nodes?:ResolverInputTypes["store"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate fields of "store" */
["store_aggregate_fields"]: AliasType<{
	avg?:ResolverInputTypes["store_avg_fields"],
count?: [{	columns?: Array<ResolverInputTypes["store_select_column"]> | undefined | null,	distinct?: boolean | undefined | null},boolean | `@${string}`],
	max?:ResolverInputTypes["store_max_fields"],
	min?:ResolverInputTypes["store_min_fields"],
	stddev?:ResolverInputTypes["store_stddev_fields"],
	stddev_pop?:ResolverInputTypes["store_stddev_pop_fields"],
	stddev_samp?:ResolverInputTypes["store_stddev_samp_fields"],
	sum?:ResolverInputTypes["store_sum_fields"],
	var_pop?:ResolverInputTypes["store_var_pop_fields"],
	var_samp?:ResolverInputTypes["store_var_samp_fields"],
	variance?:ResolverInputTypes["store_variance_fields"],
		__typename?: boolean | `@${string}`
}>;
	/** aggregate avg on columns */
["store_avg_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	manager_staff_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Boolean expression to filter rows from the table "store". All fields are combined with a logical 'AND'. */
["store_bool_exp"]: {
	_and?: Array<ResolverInputTypes["store_bool_exp"]> | undefined | null,
	_not?: ResolverInputTypes["store_bool_exp"] | undefined | null,
	_or?: Array<ResolverInputTypes["store_bool_exp"]> | undefined | null,
	address_id?: ResolverInputTypes["smallint_comparison_exp"] | undefined | null,
	last_update?: ResolverInputTypes["timestamp_comparison_exp"] | undefined | null,
	manager_staff_id?: ResolverInputTypes["smallint_comparison_exp"] | undefined | null,
	store_id?: ResolverInputTypes["Int_comparison_exp"] | undefined | null
};
	/** unique or primary key constraints on table "store" */
["store_constraint"]:store_constraint;
	/** input type for incrementing numeric columns in table "store" */
["store_inc_input"]: {
	address_id?: ResolverInputTypes["smallint"] | undefined | null,
	manager_staff_id?: ResolverInputTypes["smallint"] | undefined | null,
	store_id?: number | undefined | null
};
	/** input type for inserting data into table "store" */
["store_insert_input"]: {
	address_id?: ResolverInputTypes["smallint"] | undefined | null,
	last_update?: ResolverInputTypes["timestamp"] | undefined | null,
	manager_staff_id?: ResolverInputTypes["smallint"] | undefined | null,
	store_id?: number | undefined | null
};
	/** aggregate max on columns */
["store_max_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
	manager_staff_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate min on columns */
["store_min_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	last_update?:boolean | `@${string}`,
	manager_staff_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** response of any mutation on the table "store" */
["store_mutation_response"]: AliasType<{
	/** number of rows affected by the mutation */
	affected_rows?:boolean | `@${string}`,
	/** data from the rows affected by the mutation */
	returning?:ResolverInputTypes["store"],
		__typename?: boolean | `@${string}`
}>;
	/** on_conflict condition type for table "store" */
["store_on_conflict"]: {
	constraint: ResolverInputTypes["store_constraint"],
	update_columns: Array<ResolverInputTypes["store_update_column"]>,
	where?: ResolverInputTypes["store_bool_exp"] | undefined | null
};
	/** Ordering options when selecting data from "store". */
["store_order_by"]: {
	address_id?: ResolverInputTypes["order_by"] | undefined | null,
	last_update?: ResolverInputTypes["order_by"] | undefined | null,
	manager_staff_id?: ResolverInputTypes["order_by"] | undefined | null,
	store_id?: ResolverInputTypes["order_by"] | undefined | null
};
	/** primary key columns input for table: store */
["store_pk_columns_input"]: {
	store_id: number
};
	/** select columns of table "store" */
["store_select_column"]:store_select_column;
	/** input type for updating data in table "store" */
["store_set_input"]: {
	address_id?: ResolverInputTypes["smallint"] | undefined | null,
	last_update?: ResolverInputTypes["timestamp"] | undefined | null,
	manager_staff_id?: ResolverInputTypes["smallint"] | undefined | null,
	store_id?: number | undefined | null
};
	/** aggregate stddev on columns */
["store_stddev_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	manager_staff_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_pop on columns */
["store_stddev_pop_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	manager_staff_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate stddev_samp on columns */
["store_stddev_samp_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	manager_staff_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** Streaming cursor of the table "store" */
["store_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ResolverInputTypes["store_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: ResolverInputTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["store_stream_cursor_value_input"]: {
	address_id?: ResolverInputTypes["smallint"] | undefined | null,
	last_update?: ResolverInputTypes["timestamp"] | undefined | null,
	manager_staff_id?: ResolverInputTypes["smallint"] | undefined | null,
	store_id?: number | undefined | null
};
	/** aggregate sum on columns */
["store_sum_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	manager_staff_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** update columns of table "store" */
["store_update_column"]:store_update_column;
	["store_updates"]: {
	/** increments the numeric columns with given value of the filtered values */
	_inc?: ResolverInputTypes["store_inc_input"] | undefined | null,
	/** sets the columns of the filtered rows to the given values */
	_set?: ResolverInputTypes["store_set_input"] | undefined | null,
	/** filter the rows which have to be updated */
	where: ResolverInputTypes["store_bool_exp"]
};
	/** aggregate var_pop on columns */
["store_var_pop_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	manager_staff_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate var_samp on columns */
["store_var_samp_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	manager_staff_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	/** aggregate variance on columns */
["store_variance_fields"]: AliasType<{
	address_id?:boolean | `@${string}`,
	manager_staff_id?:boolean | `@${string}`,
	store_id?:boolean | `@${string}`,
		__typename?: boolean | `@${string}`
}>;
	["subscription_root"]: AliasType<{
actor?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["actor_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["actor_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["actor_bool_exp"] | undefined | null},ResolverInputTypes["actor"]],
actor_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["actor_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["actor_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["actor_bool_exp"] | undefined | null},ResolverInputTypes["actor_aggregate"]],
actor_by_pk?: [{	actor_id: number},ResolverInputTypes["actor"]],
actor_info?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["actor_info_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["actor_info_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["actor_info_bool_exp"] | undefined | null},ResolverInputTypes["actor_info"]],
actor_info_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["actor_info_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["actor_info_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["actor_info_bool_exp"] | undefined | null},ResolverInputTypes["actor_info_aggregate"]],
actor_info_stream?: [{	/** maximum number of rows returned in a single batch */
	batch_size: number,	/** cursor to stream the results returned by the query */
	cursor: Array<ResolverInputTypes["actor_info_stream_cursor_input"] | undefined | null>,	/** filter the rows returned */
	where?: ResolverInputTypes["actor_info_bool_exp"] | undefined | null},ResolverInputTypes["actor_info"]],
actor_stream?: [{	/** maximum number of rows returned in a single batch */
	batch_size: number,	/** cursor to stream the results returned by the query */
	cursor: Array<ResolverInputTypes["actor_stream_cursor_input"] | undefined | null>,	/** filter the rows returned */
	where?: ResolverInputTypes["actor_bool_exp"] | undefined | null},ResolverInputTypes["actor"]],
address?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["address_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["address_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["address_bool_exp"] | undefined | null},ResolverInputTypes["address"]],
address_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["address_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["address_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["address_bool_exp"] | undefined | null},ResolverInputTypes["address_aggregate"]],
address_by_pk?: [{	address_id: number},ResolverInputTypes["address"]],
address_stream?: [{	/** maximum number of rows returned in a single batch */
	batch_size: number,	/** cursor to stream the results returned by the query */
	cursor: Array<ResolverInputTypes["address_stream_cursor_input"] | undefined | null>,	/** filter the rows returned */
	where?: ResolverInputTypes["address_bool_exp"] | undefined | null},ResolverInputTypes["address"]],
category?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["category_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["category_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["category_bool_exp"] | undefined | null},ResolverInputTypes["category"]],
category_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["category_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["category_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["category_bool_exp"] | undefined | null},ResolverInputTypes["category_aggregate"]],
category_by_pk?: [{	category_id: number},ResolverInputTypes["category"]],
category_stream?: [{	/** maximum number of rows returned in a single batch */
	batch_size: number,	/** cursor to stream the results returned by the query */
	cursor: Array<ResolverInputTypes["category_stream_cursor_input"] | undefined | null>,	/** filter the rows returned */
	where?: ResolverInputTypes["category_bool_exp"] | undefined | null},ResolverInputTypes["category"]],
city?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["city_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["city_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["city_bool_exp"] | undefined | null},ResolverInputTypes["city"]],
city_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["city_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["city_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["city_bool_exp"] | undefined | null},ResolverInputTypes["city_aggregate"]],
city_by_pk?: [{	city_id: number},ResolverInputTypes["city"]],
city_stream?: [{	/** maximum number of rows returned in a single batch */
	batch_size: number,	/** cursor to stream the results returned by the query */
	cursor: Array<ResolverInputTypes["city_stream_cursor_input"] | undefined | null>,	/** filter the rows returned */
	where?: ResolverInputTypes["city_bool_exp"] | undefined | null},ResolverInputTypes["city"]],
country?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["country_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["country_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["country_bool_exp"] | undefined | null},ResolverInputTypes["country"]],
country_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["country_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["country_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["country_bool_exp"] | undefined | null},ResolverInputTypes["country_aggregate"]],
country_by_pk?: [{	country_id: number},ResolverInputTypes["country"]],
country_stream?: [{	/** maximum number of rows returned in a single batch */
	batch_size: number,	/** cursor to stream the results returned by the query */
	cursor: Array<ResolverInputTypes["country_stream_cursor_input"] | undefined | null>,	/** filter the rows returned */
	where?: ResolverInputTypes["country_bool_exp"] | undefined | null},ResolverInputTypes["country"]],
customer?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["customer_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["customer_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["customer_bool_exp"] | undefined | null},ResolverInputTypes["customer"]],
customer_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["customer_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["customer_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["customer_bool_exp"] | undefined | null},ResolverInputTypes["customer_aggregate"]],
customer_by_pk?: [{	customer_id: number},ResolverInputTypes["customer"]],
customer_list?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["customer_list_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["customer_list_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["customer_list_bool_exp"] | undefined | null},ResolverInputTypes["customer_list"]],
customer_list_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["customer_list_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["customer_list_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["customer_list_bool_exp"] | undefined | null},ResolverInputTypes["customer_list_aggregate"]],
customer_list_stream?: [{	/** maximum number of rows returned in a single batch */
	batch_size: number,	/** cursor to stream the results returned by the query */
	cursor: Array<ResolverInputTypes["customer_list_stream_cursor_input"] | undefined | null>,	/** filter the rows returned */
	where?: ResolverInputTypes["customer_list_bool_exp"] | undefined | null},ResolverInputTypes["customer_list"]],
customer_stream?: [{	/** maximum number of rows returned in a single batch */
	batch_size: number,	/** cursor to stream the results returned by the query */
	cursor: Array<ResolverInputTypes["customer_stream_cursor_input"] | undefined | null>,	/** filter the rows returned */
	where?: ResolverInputTypes["customer_bool_exp"] | undefined | null},ResolverInputTypes["customer"]],
film?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["film_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["film_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["film_bool_exp"] | undefined | null},ResolverInputTypes["film"]],
film_actor?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["film_actor_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["film_actor_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["film_actor_bool_exp"] | undefined | null},ResolverInputTypes["film_actor"]],
film_actor_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["film_actor_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["film_actor_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["film_actor_bool_exp"] | undefined | null},ResolverInputTypes["film_actor_aggregate"]],
film_actor_by_pk?: [{	actor_id: ResolverInputTypes["smallint"],	film_id: ResolverInputTypes["smallint"]},ResolverInputTypes["film_actor"]],
film_actor_stream?: [{	/** maximum number of rows returned in a single batch */
	batch_size: number,	/** cursor to stream the results returned by the query */
	cursor: Array<ResolverInputTypes["film_actor_stream_cursor_input"] | undefined | null>,	/** filter the rows returned */
	where?: ResolverInputTypes["film_actor_bool_exp"] | undefined | null},ResolverInputTypes["film_actor"]],
film_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["film_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["film_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["film_bool_exp"] | undefined | null},ResolverInputTypes["film_aggregate"]],
film_by_pk?: [{	film_id: number},ResolverInputTypes["film"]],
film_category?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["film_category_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["film_category_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["film_category_bool_exp"] | undefined | null},ResolverInputTypes["film_category"]],
film_category_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["film_category_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["film_category_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["film_category_bool_exp"] | undefined | null},ResolverInputTypes["film_category_aggregate"]],
film_category_by_pk?: [{	category_id: ResolverInputTypes["smallint"],	film_id: ResolverInputTypes["smallint"]},ResolverInputTypes["film_category"]],
film_category_stream?: [{	/** maximum number of rows returned in a single batch */
	batch_size: number,	/** cursor to stream the results returned by the query */
	cursor: Array<ResolverInputTypes["film_category_stream_cursor_input"] | undefined | null>,	/** filter the rows returned */
	where?: ResolverInputTypes["film_category_bool_exp"] | undefined | null},ResolverInputTypes["film_category"]],
film_list?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["film_list_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["film_list_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["film_list_bool_exp"] | undefined | null},ResolverInputTypes["film_list"]],
film_list_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["film_list_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["film_list_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["film_list_bool_exp"] | undefined | null},ResolverInputTypes["film_list_aggregate"]],
film_list_stream?: [{	/** maximum number of rows returned in a single batch */
	batch_size: number,	/** cursor to stream the results returned by the query */
	cursor: Array<ResolverInputTypes["film_list_stream_cursor_input"] | undefined | null>,	/** filter the rows returned */
	where?: ResolverInputTypes["film_list_bool_exp"] | undefined | null},ResolverInputTypes["film_list"]],
film_stream?: [{	/** maximum number of rows returned in a single batch */
	batch_size: number,	/** cursor to stream the results returned by the query */
	cursor: Array<ResolverInputTypes["film_stream_cursor_input"] | undefined | null>,	/** filter the rows returned */
	where?: ResolverInputTypes["film_bool_exp"] | undefined | null},ResolverInputTypes["film"]],
inventory?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["inventory_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["inventory_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["inventory_bool_exp"] | undefined | null},ResolverInputTypes["inventory"]],
inventory_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["inventory_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["inventory_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["inventory_bool_exp"] | undefined | null},ResolverInputTypes["inventory_aggregate"]],
inventory_by_pk?: [{	inventory_id: number},ResolverInputTypes["inventory"]],
inventory_stream?: [{	/** maximum number of rows returned in a single batch */
	batch_size: number,	/** cursor to stream the results returned by the query */
	cursor: Array<ResolverInputTypes["inventory_stream_cursor_input"] | undefined | null>,	/** filter the rows returned */
	where?: ResolverInputTypes["inventory_bool_exp"] | undefined | null},ResolverInputTypes["inventory"]],
language?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["language_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["language_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["language_bool_exp"] | undefined | null},ResolverInputTypes["language"]],
language_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["language_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["language_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["language_bool_exp"] | undefined | null},ResolverInputTypes["language_aggregate"]],
language_by_pk?: [{	language_id: number},ResolverInputTypes["language"]],
language_stream?: [{	/** maximum number of rows returned in a single batch */
	batch_size: number,	/** cursor to stream the results returned by the query */
	cursor: Array<ResolverInputTypes["language_stream_cursor_input"] | undefined | null>,	/** filter the rows returned */
	where?: ResolverInputTypes["language_bool_exp"] | undefined | null},ResolverInputTypes["language"]],
nicer_but_slower_film_list?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["nicer_but_slower_film_list_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["nicer_but_slower_film_list_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["nicer_but_slower_film_list_bool_exp"] | undefined | null},ResolverInputTypes["nicer_but_slower_film_list"]],
nicer_but_slower_film_list_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["nicer_but_slower_film_list_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["nicer_but_slower_film_list_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["nicer_but_slower_film_list_bool_exp"] | undefined | null},ResolverInputTypes["nicer_but_slower_film_list_aggregate"]],
nicer_but_slower_film_list_stream?: [{	/** maximum number of rows returned in a single batch */
	batch_size: number,	/** cursor to stream the results returned by the query */
	cursor: Array<ResolverInputTypes["nicer_but_slower_film_list_stream_cursor_input"] | undefined | null>,	/** filter the rows returned */
	where?: ResolverInputTypes["nicer_but_slower_film_list_bool_exp"] | undefined | null},ResolverInputTypes["nicer_but_slower_film_list"]],
payment?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["payment_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["payment_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["payment_bool_exp"] | undefined | null},ResolverInputTypes["payment"]],
payment_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["payment_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["payment_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["payment_bool_exp"] | undefined | null},ResolverInputTypes["payment_aggregate"]],
payment_by_pk?: [{	payment_id: number},ResolverInputTypes["payment"]],
payment_stream?: [{	/** maximum number of rows returned in a single batch */
	batch_size: number,	/** cursor to stream the results returned by the query */
	cursor: Array<ResolverInputTypes["payment_stream_cursor_input"] | undefined | null>,	/** filter the rows returned */
	where?: ResolverInputTypes["payment_bool_exp"] | undefined | null},ResolverInputTypes["payment"]],
rental?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["rental_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["rental_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["rental_bool_exp"] | undefined | null},ResolverInputTypes["rental"]],
rental_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["rental_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["rental_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["rental_bool_exp"] | undefined | null},ResolverInputTypes["rental_aggregate"]],
rental_by_pk?: [{	rental_id: number},ResolverInputTypes["rental"]],
rental_stream?: [{	/** maximum number of rows returned in a single batch */
	batch_size: number,	/** cursor to stream the results returned by the query */
	cursor: Array<ResolverInputTypes["rental_stream_cursor_input"] | undefined | null>,	/** filter the rows returned */
	where?: ResolverInputTypes["rental_bool_exp"] | undefined | null},ResolverInputTypes["rental"]],
sales_by_film_category?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["sales_by_film_category_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["sales_by_film_category_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["sales_by_film_category_bool_exp"] | undefined | null},ResolverInputTypes["sales_by_film_category"]],
sales_by_film_category_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["sales_by_film_category_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["sales_by_film_category_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["sales_by_film_category_bool_exp"] | undefined | null},ResolverInputTypes["sales_by_film_category_aggregate"]],
sales_by_film_category_stream?: [{	/** maximum number of rows returned in a single batch */
	batch_size: number,	/** cursor to stream the results returned by the query */
	cursor: Array<ResolverInputTypes["sales_by_film_category_stream_cursor_input"] | undefined | null>,	/** filter the rows returned */
	where?: ResolverInputTypes["sales_by_film_category_bool_exp"] | undefined | null},ResolverInputTypes["sales_by_film_category"]],
sales_by_store?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["sales_by_store_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["sales_by_store_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["sales_by_store_bool_exp"] | undefined | null},ResolverInputTypes["sales_by_store"]],
sales_by_store_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["sales_by_store_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["sales_by_store_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["sales_by_store_bool_exp"] | undefined | null},ResolverInputTypes["sales_by_store_aggregate"]],
sales_by_store_stream?: [{	/** maximum number of rows returned in a single batch */
	batch_size: number,	/** cursor to stream the results returned by the query */
	cursor: Array<ResolverInputTypes["sales_by_store_stream_cursor_input"] | undefined | null>,	/** filter the rows returned */
	where?: ResolverInputTypes["sales_by_store_bool_exp"] | undefined | null},ResolverInputTypes["sales_by_store"]],
staff?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["staff_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["staff_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["staff_bool_exp"] | undefined | null},ResolverInputTypes["staff"]],
staff_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["staff_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["staff_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["staff_bool_exp"] | undefined | null},ResolverInputTypes["staff_aggregate"]],
staff_by_pk?: [{	staff_id: number},ResolverInputTypes["staff"]],
staff_list?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["staff_list_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["staff_list_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["staff_list_bool_exp"] | undefined | null},ResolverInputTypes["staff_list"]],
staff_list_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["staff_list_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["staff_list_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["staff_list_bool_exp"] | undefined | null},ResolverInputTypes["staff_list_aggregate"]],
staff_list_stream?: [{	/** maximum number of rows returned in a single batch */
	batch_size: number,	/** cursor to stream the results returned by the query */
	cursor: Array<ResolverInputTypes["staff_list_stream_cursor_input"] | undefined | null>,	/** filter the rows returned */
	where?: ResolverInputTypes["staff_list_bool_exp"] | undefined | null},ResolverInputTypes["staff_list"]],
staff_stream?: [{	/** maximum number of rows returned in a single batch */
	batch_size: number,	/** cursor to stream the results returned by the query */
	cursor: Array<ResolverInputTypes["staff_stream_cursor_input"] | undefined | null>,	/** filter the rows returned */
	where?: ResolverInputTypes["staff_bool_exp"] | undefined | null},ResolverInputTypes["staff"]],
store?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["store_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["store_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["store_bool_exp"] | undefined | null},ResolverInputTypes["store"]],
store_aggregate?: [{	/** distinct select on columns */
	distinct_on?: Array<ResolverInputTypes["store_select_column"]> | undefined | null,	/** limit the number of rows returned */
	limit?: number | undefined | null,	/** skip the first n rows. Use only with order_by */
	offset?: number | undefined | null,	/** sort the rows by one or more columns */
	order_by?: Array<ResolverInputTypes["store_order_by"]> | undefined | null,	/** filter the rows returned */
	where?: ResolverInputTypes["store_bool_exp"] | undefined | null},ResolverInputTypes["store_aggregate"]],
store_by_pk?: [{	store_id: number},ResolverInputTypes["store"]],
store_stream?: [{	/** maximum number of rows returned in a single batch */
	batch_size: number,	/** cursor to stream the results returned by the query */
	cursor: Array<ResolverInputTypes["store_stream_cursor_input"] | undefined | null>,	/** filter the rows returned */
	where?: ResolverInputTypes["store_bool_exp"] | undefined | null},ResolverInputTypes["store"]],
		__typename?: boolean | `@${string}`
}>;
	["timestamp"]:unknown;
	/** Boolean expression to compare columns of type "timestamp". All fields are combined with logical 'AND'. */
["timestamp_comparison_exp"]: {
	_eq?: ResolverInputTypes["timestamp"] | undefined | null,
	_gt?: ResolverInputTypes["timestamp"] | undefined | null,
	_gte?: ResolverInputTypes["timestamp"] | undefined | null,
	_in?: Array<ResolverInputTypes["timestamp"]> | undefined | null,
	_is_null?: boolean | undefined | null,
	_lt?: ResolverInputTypes["timestamp"] | undefined | null,
	_lte?: ResolverInputTypes["timestamp"] | undefined | null,
	_neq?: ResolverInputTypes["timestamp"] | undefined | null,
	_nin?: Array<ResolverInputTypes["timestamp"]> | undefined | null
};
	["tsvector"]:unknown;
	/** Boolean expression to compare columns of type "tsvector". All fields are combined with logical 'AND'. */
["tsvector_comparison_exp"]: {
	_eq?: ResolverInputTypes["tsvector"] | undefined | null,
	_gt?: ResolverInputTypes["tsvector"] | undefined | null,
	_gte?: ResolverInputTypes["tsvector"] | undefined | null,
	_in?: Array<ResolverInputTypes["tsvector"]> | undefined | null,
	_is_null?: boolean | undefined | null,
	_lt?: ResolverInputTypes["tsvector"] | undefined | null,
	_lte?: ResolverInputTypes["tsvector"] | undefined | null,
	_neq?: ResolverInputTypes["tsvector"] | undefined | null,
	_nin?: Array<ResolverInputTypes["tsvector"]> | undefined | null
}
  }

export type ModelTypes = {
    ["schema"]: {
	query?: ModelTypes["query_root"] | undefined | null,
	mutation?: ModelTypes["mutation_root"] | undefined | null,
	subscription?: ModelTypes["subscription_root"] | undefined | null
};
	/** Boolean expression to compare columns of type "Boolean". All fields are combined with logical 'AND'. */
["Boolean_comparison_exp"]: {
	_eq?: boolean | undefined | null,
	_gt?: boolean | undefined | null,
	_gte?: boolean | undefined | null,
	_in?: Array<boolean> | undefined | null,
	_is_null?: boolean | undefined | null,
	_lt?: boolean | undefined | null,
	_lte?: boolean | undefined | null,
	_neq?: boolean | undefined | null,
	_nin?: Array<boolean> | undefined | null
};
	/** Boolean expression to compare columns of type "Int". All fields are combined with logical 'AND'. */
["Int_comparison_exp"]: {
	_eq?: number | undefined | null,
	_gt?: number | undefined | null,
	_gte?: number | undefined | null,
	_in?: Array<number> | undefined | null,
	_is_null?: boolean | undefined | null,
	_lt?: number | undefined | null,
	_lte?: number | undefined | null,
	_neq?: number | undefined | null,
	_nin?: Array<number> | undefined | null
};
	/** Boolean expression to compare columns of type "String". All fields are combined with logical 'AND'. */
["String_comparison_exp"]: {
	_eq?: string | undefined | null,
	_gt?: string | undefined | null,
	_gte?: string | undefined | null,
	/** does the column match the given case-insensitive pattern */
	_ilike?: string | undefined | null,
	_in?: Array<string> | undefined | null,
	/** does the column match the given POSIX regular expression, case insensitive */
	_iregex?: string | undefined | null,
	_is_null?: boolean | undefined | null,
	/** does the column match the given pattern */
	_like?: string | undefined | null,
	_lt?: string | undefined | null,
	_lte?: string | undefined | null,
	_neq?: string | undefined | null,
	/** does the column NOT match the given case-insensitive pattern */
	_nilike?: string | undefined | null,
	_nin?: Array<string> | undefined | null,
	/** does the column NOT match the given POSIX regular expression, case insensitive */
	_niregex?: string | undefined | null,
	/** does the column NOT match the given pattern */
	_nlike?: string | undefined | null,
	/** does the column NOT match the given POSIX regular expression, case sensitive */
	_nregex?: string | undefined | null,
	/** does the column NOT match the given SQL regular expression */
	_nsimilar?: string | undefined | null,
	/** does the column match the given POSIX regular expression, case sensitive */
	_regex?: string | undefined | null,
	/** does the column match the given SQL regular expression */
	_similar?: string | undefined | null
};
	["_text"]:any;
	/** Boolean expression to compare columns of type "_text". All fields are combined with logical 'AND'. */
["_text_comparison_exp"]: {
	_eq?: ModelTypes["_text"] | undefined | null,
	_gt?: ModelTypes["_text"] | undefined | null,
	_gte?: ModelTypes["_text"] | undefined | null,
	_in?: Array<ModelTypes["_text"]> | undefined | null,
	_is_null?: boolean | undefined | null,
	_lt?: ModelTypes["_text"] | undefined | null,
	_lte?: ModelTypes["_text"] | undefined | null,
	_neq?: ModelTypes["_text"] | undefined | null,
	_nin?: Array<ModelTypes["_text"]> | undefined | null
};
	/** columns and relationships of "actor" */
["actor"]: {
		actor_id: number,
	first_name: string,
	last_name: string,
	last_update: ModelTypes["timestamp"]
};
	/** aggregated selection of "actor" */
["actor_aggregate"]: {
		aggregate?: ModelTypes["actor_aggregate_fields"] | undefined | null,
	nodes: Array<ModelTypes["actor"]>
};
	/** aggregate fields of "actor" */
["actor_aggregate_fields"]: {
		avg?: ModelTypes["actor_avg_fields"] | undefined | null,
	count: number,
	max?: ModelTypes["actor_max_fields"] | undefined | null,
	min?: ModelTypes["actor_min_fields"] | undefined | null,
	stddev?: ModelTypes["actor_stddev_fields"] | undefined | null,
	stddev_pop?: ModelTypes["actor_stddev_pop_fields"] | undefined | null,
	stddev_samp?: ModelTypes["actor_stddev_samp_fields"] | undefined | null,
	sum?: ModelTypes["actor_sum_fields"] | undefined | null,
	var_pop?: ModelTypes["actor_var_pop_fields"] | undefined | null,
	var_samp?: ModelTypes["actor_var_samp_fields"] | undefined | null,
	variance?: ModelTypes["actor_variance_fields"] | undefined | null
};
	/** aggregate avg on columns */
["actor_avg_fields"]: {
		actor_id?: number | undefined | null
};
	/** Boolean expression to filter rows from the table "actor". All fields are combined with a logical 'AND'. */
["actor_bool_exp"]: {
	_and?: Array<ModelTypes["actor_bool_exp"]> | undefined | null,
	_not?: ModelTypes["actor_bool_exp"] | undefined | null,
	_or?: Array<ModelTypes["actor_bool_exp"]> | undefined | null,
	actor_id?: ModelTypes["Int_comparison_exp"] | undefined | null,
	first_name?: ModelTypes["String_comparison_exp"] | undefined | null,
	last_name?: ModelTypes["String_comparison_exp"] | undefined | null,
	last_update?: ModelTypes["timestamp_comparison_exp"] | undefined | null
};
	["actor_constraint"]:actor_constraint;
	/** input type for incrementing numeric columns in table "actor" */
["actor_inc_input"]: {
	actor_id?: number | undefined | null
};
	/** columns and relationships of "actor_info" */
["actor_info"]: {
		actor_id?: number | undefined | null,
	film_info?: string | undefined | null,
	first_name?: string | undefined | null,
	last_name?: string | undefined | null
};
	/** aggregated selection of "actor_info" */
["actor_info_aggregate"]: {
		aggregate?: ModelTypes["actor_info_aggregate_fields"] | undefined | null,
	nodes: Array<ModelTypes["actor_info"]>
};
	/** aggregate fields of "actor_info" */
["actor_info_aggregate_fields"]: {
		avg?: ModelTypes["actor_info_avg_fields"] | undefined | null,
	count: number,
	max?: ModelTypes["actor_info_max_fields"] | undefined | null,
	min?: ModelTypes["actor_info_min_fields"] | undefined | null,
	stddev?: ModelTypes["actor_info_stddev_fields"] | undefined | null,
	stddev_pop?: ModelTypes["actor_info_stddev_pop_fields"] | undefined | null,
	stddev_samp?: ModelTypes["actor_info_stddev_samp_fields"] | undefined | null,
	sum?: ModelTypes["actor_info_sum_fields"] | undefined | null,
	var_pop?: ModelTypes["actor_info_var_pop_fields"] | undefined | null,
	var_samp?: ModelTypes["actor_info_var_samp_fields"] | undefined | null,
	variance?: ModelTypes["actor_info_variance_fields"] | undefined | null
};
	/** aggregate avg on columns */
["actor_info_avg_fields"]: {
		actor_id?: number | undefined | null
};
	/** Boolean expression to filter rows from the table "actor_info". All fields are combined with a logical 'AND'. */
["actor_info_bool_exp"]: {
	_and?: Array<ModelTypes["actor_info_bool_exp"]> | undefined | null,
	_not?: ModelTypes["actor_info_bool_exp"] | undefined | null,
	_or?: Array<ModelTypes["actor_info_bool_exp"]> | undefined | null,
	actor_id?: ModelTypes["Int_comparison_exp"] | undefined | null,
	film_info?: ModelTypes["String_comparison_exp"] | undefined | null,
	first_name?: ModelTypes["String_comparison_exp"] | undefined | null,
	last_name?: ModelTypes["String_comparison_exp"] | undefined | null
};
	/** aggregate max on columns */
["actor_info_max_fields"]: {
		actor_id?: number | undefined | null,
	film_info?: string | undefined | null,
	first_name?: string | undefined | null,
	last_name?: string | undefined | null
};
	/** aggregate min on columns */
["actor_info_min_fields"]: {
		actor_id?: number | undefined | null,
	film_info?: string | undefined | null,
	first_name?: string | undefined | null,
	last_name?: string | undefined | null
};
	/** Ordering options when selecting data from "actor_info". */
["actor_info_order_by"]: {
	actor_id?: ModelTypes["order_by"] | undefined | null,
	film_info?: ModelTypes["order_by"] | undefined | null,
	first_name?: ModelTypes["order_by"] | undefined | null,
	last_name?: ModelTypes["order_by"] | undefined | null
};
	["actor_info_select_column"]:actor_info_select_column;
	/** aggregate stddev on columns */
["actor_info_stddev_fields"]: {
		actor_id?: number | undefined | null
};
	/** aggregate stddev_pop on columns */
["actor_info_stddev_pop_fields"]: {
		actor_id?: number | undefined | null
};
	/** aggregate stddev_samp on columns */
["actor_info_stddev_samp_fields"]: {
		actor_id?: number | undefined | null
};
	/** Streaming cursor of the table "actor_info" */
["actor_info_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ModelTypes["actor_info_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: ModelTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["actor_info_stream_cursor_value_input"]: {
	actor_id?: number | undefined | null,
	film_info?: string | undefined | null,
	first_name?: string | undefined | null,
	last_name?: string | undefined | null
};
	/** aggregate sum on columns */
["actor_info_sum_fields"]: {
		actor_id?: number | undefined | null
};
	/** aggregate var_pop on columns */
["actor_info_var_pop_fields"]: {
		actor_id?: number | undefined | null
};
	/** aggregate var_samp on columns */
["actor_info_var_samp_fields"]: {
		actor_id?: number | undefined | null
};
	/** aggregate variance on columns */
["actor_info_variance_fields"]: {
		actor_id?: number | undefined | null
};
	/** input type for inserting data into table "actor" */
["actor_insert_input"]: {
	actor_id?: number | undefined | null,
	first_name?: string | undefined | null,
	last_name?: string | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null
};
	/** aggregate max on columns */
["actor_max_fields"]: {
		actor_id?: number | undefined | null,
	first_name?: string | undefined | null,
	last_name?: string | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null
};
	/** aggregate min on columns */
["actor_min_fields"]: {
		actor_id?: number | undefined | null,
	first_name?: string | undefined | null,
	last_name?: string | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null
};
	/** response of any mutation on the table "actor" */
["actor_mutation_response"]: {
		/** number of rows affected by the mutation */
	affected_rows: number,
	/** data from the rows affected by the mutation */
	returning: Array<ModelTypes["actor"]>
};
	/** on_conflict condition type for table "actor" */
["actor_on_conflict"]: {
	constraint: ModelTypes["actor_constraint"],
	update_columns: Array<ModelTypes["actor_update_column"]>,
	where?: ModelTypes["actor_bool_exp"] | undefined | null
};
	/** Ordering options when selecting data from "actor". */
["actor_order_by"]: {
	actor_id?: ModelTypes["order_by"] | undefined | null,
	first_name?: ModelTypes["order_by"] | undefined | null,
	last_name?: ModelTypes["order_by"] | undefined | null,
	last_update?: ModelTypes["order_by"] | undefined | null
};
	/** primary key columns input for table: actor */
["actor_pk_columns_input"]: {
	actor_id: number
};
	["actor_select_column"]:actor_select_column;
	/** input type for updating data in table "actor" */
["actor_set_input"]: {
	actor_id?: number | undefined | null,
	first_name?: string | undefined | null,
	last_name?: string | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null
};
	/** aggregate stddev on columns */
["actor_stddev_fields"]: {
		actor_id?: number | undefined | null
};
	/** aggregate stddev_pop on columns */
["actor_stddev_pop_fields"]: {
		actor_id?: number | undefined | null
};
	/** aggregate stddev_samp on columns */
["actor_stddev_samp_fields"]: {
		actor_id?: number | undefined | null
};
	/** Streaming cursor of the table "actor" */
["actor_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ModelTypes["actor_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: ModelTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["actor_stream_cursor_value_input"]: {
	actor_id?: number | undefined | null,
	first_name?: string | undefined | null,
	last_name?: string | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null
};
	/** aggregate sum on columns */
["actor_sum_fields"]: {
		actor_id?: number | undefined | null
};
	["actor_update_column"]:actor_update_column;
	["actor_updates"]: {
	/** increments the numeric columns with given value of the filtered values */
	_inc?: ModelTypes["actor_inc_input"] | undefined | null,
	/** sets the columns of the filtered rows to the given values */
	_set?: ModelTypes["actor_set_input"] | undefined | null,
	/** filter the rows which have to be updated */
	where: ModelTypes["actor_bool_exp"]
};
	/** aggregate var_pop on columns */
["actor_var_pop_fields"]: {
		actor_id?: number | undefined | null
};
	/** aggregate var_samp on columns */
["actor_var_samp_fields"]: {
		actor_id?: number | undefined | null
};
	/** aggregate variance on columns */
["actor_variance_fields"]: {
		actor_id?: number | undefined | null
};
	/** columns and relationships of "address" */
["address"]: {
		address: string,
	address2?: string | undefined | null,
	address_id: number,
	city_id: ModelTypes["smallint"],
	district: string,
	last_update: ModelTypes["timestamp"],
	phone: string,
	postal_code?: string | undefined | null
};
	/** aggregated selection of "address" */
["address_aggregate"]: {
		aggregate?: ModelTypes["address_aggregate_fields"] | undefined | null,
	nodes: Array<ModelTypes["address"]>
};
	/** aggregate fields of "address" */
["address_aggregate_fields"]: {
		avg?: ModelTypes["address_avg_fields"] | undefined | null,
	count: number,
	max?: ModelTypes["address_max_fields"] | undefined | null,
	min?: ModelTypes["address_min_fields"] | undefined | null,
	stddev?: ModelTypes["address_stddev_fields"] | undefined | null,
	stddev_pop?: ModelTypes["address_stddev_pop_fields"] | undefined | null,
	stddev_samp?: ModelTypes["address_stddev_samp_fields"] | undefined | null,
	sum?: ModelTypes["address_sum_fields"] | undefined | null,
	var_pop?: ModelTypes["address_var_pop_fields"] | undefined | null,
	var_samp?: ModelTypes["address_var_samp_fields"] | undefined | null,
	variance?: ModelTypes["address_variance_fields"] | undefined | null
};
	/** aggregate avg on columns */
["address_avg_fields"]: {
		address_id?: number | undefined | null,
	city_id?: number | undefined | null
};
	/** Boolean expression to filter rows from the table "address". All fields are combined with a logical 'AND'. */
["address_bool_exp"]: {
	_and?: Array<ModelTypes["address_bool_exp"]> | undefined | null,
	_not?: ModelTypes["address_bool_exp"] | undefined | null,
	_or?: Array<ModelTypes["address_bool_exp"]> | undefined | null,
	address?: ModelTypes["String_comparison_exp"] | undefined | null,
	address2?: ModelTypes["String_comparison_exp"] | undefined | null,
	address_id?: ModelTypes["Int_comparison_exp"] | undefined | null,
	city_id?: ModelTypes["smallint_comparison_exp"] | undefined | null,
	district?: ModelTypes["String_comparison_exp"] | undefined | null,
	last_update?: ModelTypes["timestamp_comparison_exp"] | undefined | null,
	phone?: ModelTypes["String_comparison_exp"] | undefined | null,
	postal_code?: ModelTypes["String_comparison_exp"] | undefined | null
};
	["address_constraint"]:address_constraint;
	/** input type for incrementing numeric columns in table "address" */
["address_inc_input"]: {
	address_id?: number | undefined | null,
	city_id?: ModelTypes["smallint"] | undefined | null
};
	/** input type for inserting data into table "address" */
["address_insert_input"]: {
	address?: string | undefined | null,
	address2?: string | undefined | null,
	address_id?: number | undefined | null,
	city_id?: ModelTypes["smallint"] | undefined | null,
	district?: string | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null,
	phone?: string | undefined | null,
	postal_code?: string | undefined | null
};
	/** aggregate max on columns */
["address_max_fields"]: {
		address?: string | undefined | null,
	address2?: string | undefined | null,
	address_id?: number | undefined | null,
	city_id?: ModelTypes["smallint"] | undefined | null,
	district?: string | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null,
	phone?: string | undefined | null,
	postal_code?: string | undefined | null
};
	/** aggregate min on columns */
["address_min_fields"]: {
		address?: string | undefined | null,
	address2?: string | undefined | null,
	address_id?: number | undefined | null,
	city_id?: ModelTypes["smallint"] | undefined | null,
	district?: string | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null,
	phone?: string | undefined | null,
	postal_code?: string | undefined | null
};
	/** response of any mutation on the table "address" */
["address_mutation_response"]: {
		/** number of rows affected by the mutation */
	affected_rows: number,
	/** data from the rows affected by the mutation */
	returning: Array<ModelTypes["address"]>
};
	/** on_conflict condition type for table "address" */
["address_on_conflict"]: {
	constraint: ModelTypes["address_constraint"],
	update_columns: Array<ModelTypes["address_update_column"]>,
	where?: ModelTypes["address_bool_exp"] | undefined | null
};
	/** Ordering options when selecting data from "address". */
["address_order_by"]: {
	address?: ModelTypes["order_by"] | undefined | null,
	address2?: ModelTypes["order_by"] | undefined | null,
	address_id?: ModelTypes["order_by"] | undefined | null,
	city_id?: ModelTypes["order_by"] | undefined | null,
	district?: ModelTypes["order_by"] | undefined | null,
	last_update?: ModelTypes["order_by"] | undefined | null,
	phone?: ModelTypes["order_by"] | undefined | null,
	postal_code?: ModelTypes["order_by"] | undefined | null
};
	/** primary key columns input for table: address */
["address_pk_columns_input"]: {
	address_id: number
};
	["address_select_column"]:address_select_column;
	/** input type for updating data in table "address" */
["address_set_input"]: {
	address?: string | undefined | null,
	address2?: string | undefined | null,
	address_id?: number | undefined | null,
	city_id?: ModelTypes["smallint"] | undefined | null,
	district?: string | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null,
	phone?: string | undefined | null,
	postal_code?: string | undefined | null
};
	/** aggregate stddev on columns */
["address_stddev_fields"]: {
		address_id?: number | undefined | null,
	city_id?: number | undefined | null
};
	/** aggregate stddev_pop on columns */
["address_stddev_pop_fields"]: {
		address_id?: number | undefined | null,
	city_id?: number | undefined | null
};
	/** aggregate stddev_samp on columns */
["address_stddev_samp_fields"]: {
		address_id?: number | undefined | null,
	city_id?: number | undefined | null
};
	/** Streaming cursor of the table "address" */
["address_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ModelTypes["address_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: ModelTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["address_stream_cursor_value_input"]: {
	address?: string | undefined | null,
	address2?: string | undefined | null,
	address_id?: number | undefined | null,
	city_id?: ModelTypes["smallint"] | undefined | null,
	district?: string | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null,
	phone?: string | undefined | null,
	postal_code?: string | undefined | null
};
	/** aggregate sum on columns */
["address_sum_fields"]: {
		address_id?: number | undefined | null,
	city_id?: ModelTypes["smallint"] | undefined | null
};
	["address_update_column"]:address_update_column;
	["address_updates"]: {
	/** increments the numeric columns with given value of the filtered values */
	_inc?: ModelTypes["address_inc_input"] | undefined | null,
	/** sets the columns of the filtered rows to the given values */
	_set?: ModelTypes["address_set_input"] | undefined | null,
	/** filter the rows which have to be updated */
	where: ModelTypes["address_bool_exp"]
};
	/** aggregate var_pop on columns */
["address_var_pop_fields"]: {
		address_id?: number | undefined | null,
	city_id?: number | undefined | null
};
	/** aggregate var_samp on columns */
["address_var_samp_fields"]: {
		address_id?: number | undefined | null,
	city_id?: number | undefined | null
};
	/** aggregate variance on columns */
["address_variance_fields"]: {
		address_id?: number | undefined | null,
	city_id?: number | undefined | null
};
	["bpchar"]:any;
	/** Boolean expression to compare columns of type "bpchar". All fields are combined with logical 'AND'. */
["bpchar_comparison_exp"]: {
	_eq?: ModelTypes["bpchar"] | undefined | null,
	_gt?: ModelTypes["bpchar"] | undefined | null,
	_gte?: ModelTypes["bpchar"] | undefined | null,
	/** does the column match the given case-insensitive pattern */
	_ilike?: ModelTypes["bpchar"] | undefined | null,
	_in?: Array<ModelTypes["bpchar"]> | undefined | null,
	/** does the column match the given POSIX regular expression, case insensitive */
	_iregex?: ModelTypes["bpchar"] | undefined | null,
	_is_null?: boolean | undefined | null,
	/** does the column match the given pattern */
	_like?: ModelTypes["bpchar"] | undefined | null,
	_lt?: ModelTypes["bpchar"] | undefined | null,
	_lte?: ModelTypes["bpchar"] | undefined | null,
	_neq?: ModelTypes["bpchar"] | undefined | null,
	/** does the column NOT match the given case-insensitive pattern */
	_nilike?: ModelTypes["bpchar"] | undefined | null,
	_nin?: Array<ModelTypes["bpchar"]> | undefined | null,
	/** does the column NOT match the given POSIX regular expression, case insensitive */
	_niregex?: ModelTypes["bpchar"] | undefined | null,
	/** does the column NOT match the given pattern */
	_nlike?: ModelTypes["bpchar"] | undefined | null,
	/** does the column NOT match the given POSIX regular expression, case sensitive */
	_nregex?: ModelTypes["bpchar"] | undefined | null,
	/** does the column NOT match the given SQL regular expression */
	_nsimilar?: ModelTypes["bpchar"] | undefined | null,
	/** does the column match the given POSIX regular expression, case sensitive */
	_regex?: ModelTypes["bpchar"] | undefined | null,
	/** does the column match the given SQL regular expression */
	_similar?: ModelTypes["bpchar"] | undefined | null
};
	["bytea"]:any;
	/** Boolean expression to compare columns of type "bytea". All fields are combined with logical 'AND'. */
["bytea_comparison_exp"]: {
	_eq?: ModelTypes["bytea"] | undefined | null,
	_gt?: ModelTypes["bytea"] | undefined | null,
	_gte?: ModelTypes["bytea"] | undefined | null,
	_in?: Array<ModelTypes["bytea"]> | undefined | null,
	_is_null?: boolean | undefined | null,
	_lt?: ModelTypes["bytea"] | undefined | null,
	_lte?: ModelTypes["bytea"] | undefined | null,
	_neq?: ModelTypes["bytea"] | undefined | null,
	_nin?: Array<ModelTypes["bytea"]> | undefined | null
};
	/** columns and relationships of "category" */
["category"]: {
		category_id: number,
	last_update: ModelTypes["timestamp"],
	name: string
};
	/** aggregated selection of "category" */
["category_aggregate"]: {
		aggregate?: ModelTypes["category_aggregate_fields"] | undefined | null,
	nodes: Array<ModelTypes["category"]>
};
	/** aggregate fields of "category" */
["category_aggregate_fields"]: {
		avg?: ModelTypes["category_avg_fields"] | undefined | null,
	count: number,
	max?: ModelTypes["category_max_fields"] | undefined | null,
	min?: ModelTypes["category_min_fields"] | undefined | null,
	stddev?: ModelTypes["category_stddev_fields"] | undefined | null,
	stddev_pop?: ModelTypes["category_stddev_pop_fields"] | undefined | null,
	stddev_samp?: ModelTypes["category_stddev_samp_fields"] | undefined | null,
	sum?: ModelTypes["category_sum_fields"] | undefined | null,
	var_pop?: ModelTypes["category_var_pop_fields"] | undefined | null,
	var_samp?: ModelTypes["category_var_samp_fields"] | undefined | null,
	variance?: ModelTypes["category_variance_fields"] | undefined | null
};
	/** aggregate avg on columns */
["category_avg_fields"]: {
		category_id?: number | undefined | null
};
	/** Boolean expression to filter rows from the table "category". All fields are combined with a logical 'AND'. */
["category_bool_exp"]: {
	_and?: Array<ModelTypes["category_bool_exp"]> | undefined | null,
	_not?: ModelTypes["category_bool_exp"] | undefined | null,
	_or?: Array<ModelTypes["category_bool_exp"]> | undefined | null,
	category_id?: ModelTypes["Int_comparison_exp"] | undefined | null,
	last_update?: ModelTypes["timestamp_comparison_exp"] | undefined | null,
	name?: ModelTypes["String_comparison_exp"] | undefined | null
};
	["category_constraint"]:category_constraint;
	/** input type for incrementing numeric columns in table "category" */
["category_inc_input"]: {
	category_id?: number | undefined | null
};
	/** input type for inserting data into table "category" */
["category_insert_input"]: {
	category_id?: number | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null,
	name?: string | undefined | null
};
	/** aggregate max on columns */
["category_max_fields"]: {
		category_id?: number | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null,
	name?: string | undefined | null
};
	/** aggregate min on columns */
["category_min_fields"]: {
		category_id?: number | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null,
	name?: string | undefined | null
};
	/** response of any mutation on the table "category" */
["category_mutation_response"]: {
		/** number of rows affected by the mutation */
	affected_rows: number,
	/** data from the rows affected by the mutation */
	returning: Array<ModelTypes["category"]>
};
	/** on_conflict condition type for table "category" */
["category_on_conflict"]: {
	constraint: ModelTypes["category_constraint"],
	update_columns: Array<ModelTypes["category_update_column"]>,
	where?: ModelTypes["category_bool_exp"] | undefined | null
};
	/** Ordering options when selecting data from "category". */
["category_order_by"]: {
	category_id?: ModelTypes["order_by"] | undefined | null,
	last_update?: ModelTypes["order_by"] | undefined | null,
	name?: ModelTypes["order_by"] | undefined | null
};
	/** primary key columns input for table: category */
["category_pk_columns_input"]: {
	category_id: number
};
	["category_select_column"]:category_select_column;
	/** input type for updating data in table "category" */
["category_set_input"]: {
	category_id?: number | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null,
	name?: string | undefined | null
};
	/** aggregate stddev on columns */
["category_stddev_fields"]: {
		category_id?: number | undefined | null
};
	/** aggregate stddev_pop on columns */
["category_stddev_pop_fields"]: {
		category_id?: number | undefined | null
};
	/** aggregate stddev_samp on columns */
["category_stddev_samp_fields"]: {
		category_id?: number | undefined | null
};
	/** Streaming cursor of the table "category" */
["category_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ModelTypes["category_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: ModelTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["category_stream_cursor_value_input"]: {
	category_id?: number | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null,
	name?: string | undefined | null
};
	/** aggregate sum on columns */
["category_sum_fields"]: {
		category_id?: number | undefined | null
};
	["category_update_column"]:category_update_column;
	["category_updates"]: {
	/** increments the numeric columns with given value of the filtered values */
	_inc?: ModelTypes["category_inc_input"] | undefined | null,
	/** sets the columns of the filtered rows to the given values */
	_set?: ModelTypes["category_set_input"] | undefined | null,
	/** filter the rows which have to be updated */
	where: ModelTypes["category_bool_exp"]
};
	/** aggregate var_pop on columns */
["category_var_pop_fields"]: {
		category_id?: number | undefined | null
};
	/** aggregate var_samp on columns */
["category_var_samp_fields"]: {
		category_id?: number | undefined | null
};
	/** aggregate variance on columns */
["category_variance_fields"]: {
		category_id?: number | undefined | null
};
	/** columns and relationships of "city" */
["city"]: {
		city: string,
	city_id: number,
	country_id: ModelTypes["smallint"],
	last_update: ModelTypes["timestamp"]
};
	/** aggregated selection of "city" */
["city_aggregate"]: {
		aggregate?: ModelTypes["city_aggregate_fields"] | undefined | null,
	nodes: Array<ModelTypes["city"]>
};
	/** aggregate fields of "city" */
["city_aggregate_fields"]: {
		avg?: ModelTypes["city_avg_fields"] | undefined | null,
	count: number,
	max?: ModelTypes["city_max_fields"] | undefined | null,
	min?: ModelTypes["city_min_fields"] | undefined | null,
	stddev?: ModelTypes["city_stddev_fields"] | undefined | null,
	stddev_pop?: ModelTypes["city_stddev_pop_fields"] | undefined | null,
	stddev_samp?: ModelTypes["city_stddev_samp_fields"] | undefined | null,
	sum?: ModelTypes["city_sum_fields"] | undefined | null,
	var_pop?: ModelTypes["city_var_pop_fields"] | undefined | null,
	var_samp?: ModelTypes["city_var_samp_fields"] | undefined | null,
	variance?: ModelTypes["city_variance_fields"] | undefined | null
};
	/** aggregate avg on columns */
["city_avg_fields"]: {
		city_id?: number | undefined | null,
	country_id?: number | undefined | null
};
	/** Boolean expression to filter rows from the table "city". All fields are combined with a logical 'AND'. */
["city_bool_exp"]: {
	_and?: Array<ModelTypes["city_bool_exp"]> | undefined | null,
	_not?: ModelTypes["city_bool_exp"] | undefined | null,
	_or?: Array<ModelTypes["city_bool_exp"]> | undefined | null,
	city?: ModelTypes["String_comparison_exp"] | undefined | null,
	city_id?: ModelTypes["Int_comparison_exp"] | undefined | null,
	country_id?: ModelTypes["smallint_comparison_exp"] | undefined | null,
	last_update?: ModelTypes["timestamp_comparison_exp"] | undefined | null
};
	["city_constraint"]:city_constraint;
	/** input type for incrementing numeric columns in table "city" */
["city_inc_input"]: {
	city_id?: number | undefined | null,
	country_id?: ModelTypes["smallint"] | undefined | null
};
	/** input type for inserting data into table "city" */
["city_insert_input"]: {
	city?: string | undefined | null,
	city_id?: number | undefined | null,
	country_id?: ModelTypes["smallint"] | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null
};
	/** aggregate max on columns */
["city_max_fields"]: {
		city?: string | undefined | null,
	city_id?: number | undefined | null,
	country_id?: ModelTypes["smallint"] | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null
};
	/** aggregate min on columns */
["city_min_fields"]: {
		city?: string | undefined | null,
	city_id?: number | undefined | null,
	country_id?: ModelTypes["smallint"] | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null
};
	/** response of any mutation on the table "city" */
["city_mutation_response"]: {
		/** number of rows affected by the mutation */
	affected_rows: number,
	/** data from the rows affected by the mutation */
	returning: Array<ModelTypes["city"]>
};
	/** on_conflict condition type for table "city" */
["city_on_conflict"]: {
	constraint: ModelTypes["city_constraint"],
	update_columns: Array<ModelTypes["city_update_column"]>,
	where?: ModelTypes["city_bool_exp"] | undefined | null
};
	/** Ordering options when selecting data from "city". */
["city_order_by"]: {
	city?: ModelTypes["order_by"] | undefined | null,
	city_id?: ModelTypes["order_by"] | undefined | null,
	country_id?: ModelTypes["order_by"] | undefined | null,
	last_update?: ModelTypes["order_by"] | undefined | null
};
	/** primary key columns input for table: city */
["city_pk_columns_input"]: {
	city_id: number
};
	["city_select_column"]:city_select_column;
	/** input type for updating data in table "city" */
["city_set_input"]: {
	city?: string | undefined | null,
	city_id?: number | undefined | null,
	country_id?: ModelTypes["smallint"] | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null
};
	/** aggregate stddev on columns */
["city_stddev_fields"]: {
		city_id?: number | undefined | null,
	country_id?: number | undefined | null
};
	/** aggregate stddev_pop on columns */
["city_stddev_pop_fields"]: {
		city_id?: number | undefined | null,
	country_id?: number | undefined | null
};
	/** aggregate stddev_samp on columns */
["city_stddev_samp_fields"]: {
		city_id?: number | undefined | null,
	country_id?: number | undefined | null
};
	/** Streaming cursor of the table "city" */
["city_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ModelTypes["city_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: ModelTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["city_stream_cursor_value_input"]: {
	city?: string | undefined | null,
	city_id?: number | undefined | null,
	country_id?: ModelTypes["smallint"] | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null
};
	/** aggregate sum on columns */
["city_sum_fields"]: {
		city_id?: number | undefined | null,
	country_id?: ModelTypes["smallint"] | undefined | null
};
	["city_update_column"]:city_update_column;
	["city_updates"]: {
	/** increments the numeric columns with given value of the filtered values */
	_inc?: ModelTypes["city_inc_input"] | undefined | null,
	/** sets the columns of the filtered rows to the given values */
	_set?: ModelTypes["city_set_input"] | undefined | null,
	/** filter the rows which have to be updated */
	where: ModelTypes["city_bool_exp"]
};
	/** aggregate var_pop on columns */
["city_var_pop_fields"]: {
		city_id?: number | undefined | null,
	country_id?: number | undefined | null
};
	/** aggregate var_samp on columns */
["city_var_samp_fields"]: {
		city_id?: number | undefined | null,
	country_id?: number | undefined | null
};
	/** aggregate variance on columns */
["city_variance_fields"]: {
		city_id?: number | undefined | null,
	country_id?: number | undefined | null
};
	/** columns and relationships of "country" */
["country"]: {
		country: string,
	country_id: number,
	last_update: ModelTypes["timestamp"]
};
	/** aggregated selection of "country" */
["country_aggregate"]: {
		aggregate?: ModelTypes["country_aggregate_fields"] | undefined | null,
	nodes: Array<ModelTypes["country"]>
};
	/** aggregate fields of "country" */
["country_aggregate_fields"]: {
		avg?: ModelTypes["country_avg_fields"] | undefined | null,
	count: number,
	max?: ModelTypes["country_max_fields"] | undefined | null,
	min?: ModelTypes["country_min_fields"] | undefined | null,
	stddev?: ModelTypes["country_stddev_fields"] | undefined | null,
	stddev_pop?: ModelTypes["country_stddev_pop_fields"] | undefined | null,
	stddev_samp?: ModelTypes["country_stddev_samp_fields"] | undefined | null,
	sum?: ModelTypes["country_sum_fields"] | undefined | null,
	var_pop?: ModelTypes["country_var_pop_fields"] | undefined | null,
	var_samp?: ModelTypes["country_var_samp_fields"] | undefined | null,
	variance?: ModelTypes["country_variance_fields"] | undefined | null
};
	/** aggregate avg on columns */
["country_avg_fields"]: {
		country_id?: number | undefined | null
};
	/** Boolean expression to filter rows from the table "country". All fields are combined with a logical 'AND'. */
["country_bool_exp"]: {
	_and?: Array<ModelTypes["country_bool_exp"]> | undefined | null,
	_not?: ModelTypes["country_bool_exp"] | undefined | null,
	_or?: Array<ModelTypes["country_bool_exp"]> | undefined | null,
	country?: ModelTypes["String_comparison_exp"] | undefined | null,
	country_id?: ModelTypes["Int_comparison_exp"] | undefined | null,
	last_update?: ModelTypes["timestamp_comparison_exp"] | undefined | null
};
	["country_constraint"]:country_constraint;
	/** input type for incrementing numeric columns in table "country" */
["country_inc_input"]: {
	country_id?: number | undefined | null
};
	/** input type for inserting data into table "country" */
["country_insert_input"]: {
	country?: string | undefined | null,
	country_id?: number | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null
};
	/** aggregate max on columns */
["country_max_fields"]: {
		country?: string | undefined | null,
	country_id?: number | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null
};
	/** aggregate min on columns */
["country_min_fields"]: {
		country?: string | undefined | null,
	country_id?: number | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null
};
	/** response of any mutation on the table "country" */
["country_mutation_response"]: {
		/** number of rows affected by the mutation */
	affected_rows: number,
	/** data from the rows affected by the mutation */
	returning: Array<ModelTypes["country"]>
};
	/** on_conflict condition type for table "country" */
["country_on_conflict"]: {
	constraint: ModelTypes["country_constraint"],
	update_columns: Array<ModelTypes["country_update_column"]>,
	where?: ModelTypes["country_bool_exp"] | undefined | null
};
	/** Ordering options when selecting data from "country". */
["country_order_by"]: {
	country?: ModelTypes["order_by"] | undefined | null,
	country_id?: ModelTypes["order_by"] | undefined | null,
	last_update?: ModelTypes["order_by"] | undefined | null
};
	/** primary key columns input for table: country */
["country_pk_columns_input"]: {
	country_id: number
};
	["country_select_column"]:country_select_column;
	/** input type for updating data in table "country" */
["country_set_input"]: {
	country?: string | undefined | null,
	country_id?: number | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null
};
	/** aggregate stddev on columns */
["country_stddev_fields"]: {
		country_id?: number | undefined | null
};
	/** aggregate stddev_pop on columns */
["country_stddev_pop_fields"]: {
		country_id?: number | undefined | null
};
	/** aggregate stddev_samp on columns */
["country_stddev_samp_fields"]: {
		country_id?: number | undefined | null
};
	/** Streaming cursor of the table "country" */
["country_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ModelTypes["country_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: ModelTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["country_stream_cursor_value_input"]: {
	country?: string | undefined | null,
	country_id?: number | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null
};
	/** aggregate sum on columns */
["country_sum_fields"]: {
		country_id?: number | undefined | null
};
	["country_update_column"]:country_update_column;
	["country_updates"]: {
	/** increments the numeric columns with given value of the filtered values */
	_inc?: ModelTypes["country_inc_input"] | undefined | null,
	/** sets the columns of the filtered rows to the given values */
	_set?: ModelTypes["country_set_input"] | undefined | null,
	/** filter the rows which have to be updated */
	where: ModelTypes["country_bool_exp"]
};
	/** aggregate var_pop on columns */
["country_var_pop_fields"]: {
		country_id?: number | undefined | null
};
	/** aggregate var_samp on columns */
["country_var_samp_fields"]: {
		country_id?: number | undefined | null
};
	/** aggregate variance on columns */
["country_variance_fields"]: {
		country_id?: number | undefined | null
};
	["cursor_ordering"]:cursor_ordering;
	/** columns and relationships of "customer" */
["customer"]: {
		active?: number | undefined | null,
	activebool: boolean,
	address_id: ModelTypes["smallint"],
	create_date: ModelTypes["date"],
	customer_id: number,
	email?: string | undefined | null,
	first_name: string,
	last_name: string,
	last_update?: ModelTypes["timestamp"] | undefined | null,
	store_id: ModelTypes["smallint"]
};
	/** aggregated selection of "customer" */
["customer_aggregate"]: {
		aggregate?: ModelTypes["customer_aggregate_fields"] | undefined | null,
	nodes: Array<ModelTypes["customer"]>
};
	/** aggregate fields of "customer" */
["customer_aggregate_fields"]: {
		avg?: ModelTypes["customer_avg_fields"] | undefined | null,
	count: number,
	max?: ModelTypes["customer_max_fields"] | undefined | null,
	min?: ModelTypes["customer_min_fields"] | undefined | null,
	stddev?: ModelTypes["customer_stddev_fields"] | undefined | null,
	stddev_pop?: ModelTypes["customer_stddev_pop_fields"] | undefined | null,
	stddev_samp?: ModelTypes["customer_stddev_samp_fields"] | undefined | null,
	sum?: ModelTypes["customer_sum_fields"] | undefined | null,
	var_pop?: ModelTypes["customer_var_pop_fields"] | undefined | null,
	var_samp?: ModelTypes["customer_var_samp_fields"] | undefined | null,
	variance?: ModelTypes["customer_variance_fields"] | undefined | null
};
	/** aggregate avg on columns */
["customer_avg_fields"]: {
		active?: number | undefined | null,
	address_id?: number | undefined | null,
	customer_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	/** Boolean expression to filter rows from the table "customer". All fields are combined with a logical 'AND'. */
["customer_bool_exp"]: {
	_and?: Array<ModelTypes["customer_bool_exp"]> | undefined | null,
	_not?: ModelTypes["customer_bool_exp"] | undefined | null,
	_or?: Array<ModelTypes["customer_bool_exp"]> | undefined | null,
	active?: ModelTypes["Int_comparison_exp"] | undefined | null,
	activebool?: ModelTypes["Boolean_comparison_exp"] | undefined | null,
	address_id?: ModelTypes["smallint_comparison_exp"] | undefined | null,
	create_date?: ModelTypes["date_comparison_exp"] | undefined | null,
	customer_id?: ModelTypes["Int_comparison_exp"] | undefined | null,
	email?: ModelTypes["String_comparison_exp"] | undefined | null,
	first_name?: ModelTypes["String_comparison_exp"] | undefined | null,
	last_name?: ModelTypes["String_comparison_exp"] | undefined | null,
	last_update?: ModelTypes["timestamp_comparison_exp"] | undefined | null,
	store_id?: ModelTypes["smallint_comparison_exp"] | undefined | null
};
	["customer_constraint"]:customer_constraint;
	/** input type for incrementing numeric columns in table "customer" */
["customer_inc_input"]: {
	active?: number | undefined | null,
	address_id?: ModelTypes["smallint"] | undefined | null,
	customer_id?: number | undefined | null,
	store_id?: ModelTypes["smallint"] | undefined | null
};
	/** input type for inserting data into table "customer" */
["customer_insert_input"]: {
	active?: number | undefined | null,
	activebool?: boolean | undefined | null,
	address_id?: ModelTypes["smallint"] | undefined | null,
	create_date?: ModelTypes["date"] | undefined | null,
	customer_id?: number | undefined | null,
	email?: string | undefined | null,
	first_name?: string | undefined | null,
	last_name?: string | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null,
	store_id?: ModelTypes["smallint"] | undefined | null
};
	/** columns and relationships of "customer_list" */
["customer_list"]: {
		address?: string | undefined | null,
	city?: string | undefined | null,
	country?: string | undefined | null,
	id?: number | undefined | null,
	name?: string | undefined | null,
	notes?: string | undefined | null,
	phone?: string | undefined | null,
	sid?: ModelTypes["smallint"] | undefined | null,
	zip_code?: string | undefined | null
};
	/** aggregated selection of "customer_list" */
["customer_list_aggregate"]: {
		aggregate?: ModelTypes["customer_list_aggregate_fields"] | undefined | null,
	nodes: Array<ModelTypes["customer_list"]>
};
	/** aggregate fields of "customer_list" */
["customer_list_aggregate_fields"]: {
		avg?: ModelTypes["customer_list_avg_fields"] | undefined | null,
	count: number,
	max?: ModelTypes["customer_list_max_fields"] | undefined | null,
	min?: ModelTypes["customer_list_min_fields"] | undefined | null,
	stddev?: ModelTypes["customer_list_stddev_fields"] | undefined | null,
	stddev_pop?: ModelTypes["customer_list_stddev_pop_fields"] | undefined | null,
	stddev_samp?: ModelTypes["customer_list_stddev_samp_fields"] | undefined | null,
	sum?: ModelTypes["customer_list_sum_fields"] | undefined | null,
	var_pop?: ModelTypes["customer_list_var_pop_fields"] | undefined | null,
	var_samp?: ModelTypes["customer_list_var_samp_fields"] | undefined | null,
	variance?: ModelTypes["customer_list_variance_fields"] | undefined | null
};
	/** aggregate avg on columns */
["customer_list_avg_fields"]: {
		id?: number | undefined | null,
	sid?: number | undefined | null
};
	/** Boolean expression to filter rows from the table "customer_list". All fields are combined with a logical 'AND'. */
["customer_list_bool_exp"]: {
	_and?: Array<ModelTypes["customer_list_bool_exp"]> | undefined | null,
	_not?: ModelTypes["customer_list_bool_exp"] | undefined | null,
	_or?: Array<ModelTypes["customer_list_bool_exp"]> | undefined | null,
	address?: ModelTypes["String_comparison_exp"] | undefined | null,
	city?: ModelTypes["String_comparison_exp"] | undefined | null,
	country?: ModelTypes["String_comparison_exp"] | undefined | null,
	id?: ModelTypes["Int_comparison_exp"] | undefined | null,
	name?: ModelTypes["String_comparison_exp"] | undefined | null,
	notes?: ModelTypes["String_comparison_exp"] | undefined | null,
	phone?: ModelTypes["String_comparison_exp"] | undefined | null,
	sid?: ModelTypes["smallint_comparison_exp"] | undefined | null,
	zip_code?: ModelTypes["String_comparison_exp"] | undefined | null
};
	/** aggregate max on columns */
["customer_list_max_fields"]: {
		address?: string | undefined | null,
	city?: string | undefined | null,
	country?: string | undefined | null,
	id?: number | undefined | null,
	name?: string | undefined | null,
	notes?: string | undefined | null,
	phone?: string | undefined | null,
	sid?: ModelTypes["smallint"] | undefined | null,
	zip_code?: string | undefined | null
};
	/** aggregate min on columns */
["customer_list_min_fields"]: {
		address?: string | undefined | null,
	city?: string | undefined | null,
	country?: string | undefined | null,
	id?: number | undefined | null,
	name?: string | undefined | null,
	notes?: string | undefined | null,
	phone?: string | undefined | null,
	sid?: ModelTypes["smallint"] | undefined | null,
	zip_code?: string | undefined | null
};
	/** Ordering options when selecting data from "customer_list". */
["customer_list_order_by"]: {
	address?: ModelTypes["order_by"] | undefined | null,
	city?: ModelTypes["order_by"] | undefined | null,
	country?: ModelTypes["order_by"] | undefined | null,
	id?: ModelTypes["order_by"] | undefined | null,
	name?: ModelTypes["order_by"] | undefined | null,
	notes?: ModelTypes["order_by"] | undefined | null,
	phone?: ModelTypes["order_by"] | undefined | null,
	sid?: ModelTypes["order_by"] | undefined | null,
	zip_code?: ModelTypes["order_by"] | undefined | null
};
	["customer_list_select_column"]:customer_list_select_column;
	/** aggregate stddev on columns */
["customer_list_stddev_fields"]: {
		id?: number | undefined | null,
	sid?: number | undefined | null
};
	/** aggregate stddev_pop on columns */
["customer_list_stddev_pop_fields"]: {
		id?: number | undefined | null,
	sid?: number | undefined | null
};
	/** aggregate stddev_samp on columns */
["customer_list_stddev_samp_fields"]: {
		id?: number | undefined | null,
	sid?: number | undefined | null
};
	/** Streaming cursor of the table "customer_list" */
["customer_list_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ModelTypes["customer_list_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: ModelTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["customer_list_stream_cursor_value_input"]: {
	address?: string | undefined | null,
	city?: string | undefined | null,
	country?: string | undefined | null,
	id?: number | undefined | null,
	name?: string | undefined | null,
	notes?: string | undefined | null,
	phone?: string | undefined | null,
	sid?: ModelTypes["smallint"] | undefined | null,
	zip_code?: string | undefined | null
};
	/** aggregate sum on columns */
["customer_list_sum_fields"]: {
		id?: number | undefined | null,
	sid?: ModelTypes["smallint"] | undefined | null
};
	/** aggregate var_pop on columns */
["customer_list_var_pop_fields"]: {
		id?: number | undefined | null,
	sid?: number | undefined | null
};
	/** aggregate var_samp on columns */
["customer_list_var_samp_fields"]: {
		id?: number | undefined | null,
	sid?: number | undefined | null
};
	/** aggregate variance on columns */
["customer_list_variance_fields"]: {
		id?: number | undefined | null,
	sid?: number | undefined | null
};
	/** aggregate max on columns */
["customer_max_fields"]: {
		active?: number | undefined | null,
	address_id?: ModelTypes["smallint"] | undefined | null,
	create_date?: ModelTypes["date"] | undefined | null,
	customer_id?: number | undefined | null,
	email?: string | undefined | null,
	first_name?: string | undefined | null,
	last_name?: string | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null,
	store_id?: ModelTypes["smallint"] | undefined | null
};
	/** aggregate min on columns */
["customer_min_fields"]: {
		active?: number | undefined | null,
	address_id?: ModelTypes["smallint"] | undefined | null,
	create_date?: ModelTypes["date"] | undefined | null,
	customer_id?: number | undefined | null,
	email?: string | undefined | null,
	first_name?: string | undefined | null,
	last_name?: string | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null,
	store_id?: ModelTypes["smallint"] | undefined | null
};
	/** response of any mutation on the table "customer" */
["customer_mutation_response"]: {
		/** number of rows affected by the mutation */
	affected_rows: number,
	/** data from the rows affected by the mutation */
	returning: Array<ModelTypes["customer"]>
};
	/** on_conflict condition type for table "customer" */
["customer_on_conflict"]: {
	constraint: ModelTypes["customer_constraint"],
	update_columns: Array<ModelTypes["customer_update_column"]>,
	where?: ModelTypes["customer_bool_exp"] | undefined | null
};
	/** Ordering options when selecting data from "customer". */
["customer_order_by"]: {
	active?: ModelTypes["order_by"] | undefined | null,
	activebool?: ModelTypes["order_by"] | undefined | null,
	address_id?: ModelTypes["order_by"] | undefined | null,
	create_date?: ModelTypes["order_by"] | undefined | null,
	customer_id?: ModelTypes["order_by"] | undefined | null,
	email?: ModelTypes["order_by"] | undefined | null,
	first_name?: ModelTypes["order_by"] | undefined | null,
	last_name?: ModelTypes["order_by"] | undefined | null,
	last_update?: ModelTypes["order_by"] | undefined | null,
	store_id?: ModelTypes["order_by"] | undefined | null
};
	/** primary key columns input for table: customer */
["customer_pk_columns_input"]: {
	customer_id: number
};
	["customer_select_column"]:customer_select_column;
	/** input type for updating data in table "customer" */
["customer_set_input"]: {
	active?: number | undefined | null,
	activebool?: boolean | undefined | null,
	address_id?: ModelTypes["smallint"] | undefined | null,
	create_date?: ModelTypes["date"] | undefined | null,
	customer_id?: number | undefined | null,
	email?: string | undefined | null,
	first_name?: string | undefined | null,
	last_name?: string | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null,
	store_id?: ModelTypes["smallint"] | undefined | null
};
	/** aggregate stddev on columns */
["customer_stddev_fields"]: {
		active?: number | undefined | null,
	address_id?: number | undefined | null,
	customer_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	/** aggregate stddev_pop on columns */
["customer_stddev_pop_fields"]: {
		active?: number | undefined | null,
	address_id?: number | undefined | null,
	customer_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	/** aggregate stddev_samp on columns */
["customer_stddev_samp_fields"]: {
		active?: number | undefined | null,
	address_id?: number | undefined | null,
	customer_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	/** Streaming cursor of the table "customer" */
["customer_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ModelTypes["customer_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: ModelTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["customer_stream_cursor_value_input"]: {
	active?: number | undefined | null,
	activebool?: boolean | undefined | null,
	address_id?: ModelTypes["smallint"] | undefined | null,
	create_date?: ModelTypes["date"] | undefined | null,
	customer_id?: number | undefined | null,
	email?: string | undefined | null,
	first_name?: string | undefined | null,
	last_name?: string | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null,
	store_id?: ModelTypes["smallint"] | undefined | null
};
	/** aggregate sum on columns */
["customer_sum_fields"]: {
		active?: number | undefined | null,
	address_id?: ModelTypes["smallint"] | undefined | null,
	customer_id?: number | undefined | null,
	store_id?: ModelTypes["smallint"] | undefined | null
};
	["customer_update_column"]:customer_update_column;
	["customer_updates"]: {
	/** increments the numeric columns with given value of the filtered values */
	_inc?: ModelTypes["customer_inc_input"] | undefined | null,
	/** sets the columns of the filtered rows to the given values */
	_set?: ModelTypes["customer_set_input"] | undefined | null,
	/** filter the rows which have to be updated */
	where: ModelTypes["customer_bool_exp"]
};
	/** aggregate var_pop on columns */
["customer_var_pop_fields"]: {
		active?: number | undefined | null,
	address_id?: number | undefined | null,
	customer_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	/** aggregate var_samp on columns */
["customer_var_samp_fields"]: {
		active?: number | undefined | null,
	address_id?: number | undefined | null,
	customer_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	/** aggregate variance on columns */
["customer_variance_fields"]: {
		active?: number | undefined | null,
	address_id?: number | undefined | null,
	customer_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	["date"]:any;
	/** Boolean expression to compare columns of type "date". All fields are combined with logical 'AND'. */
["date_comparison_exp"]: {
	_eq?: ModelTypes["date"] | undefined | null,
	_gt?: ModelTypes["date"] | undefined | null,
	_gte?: ModelTypes["date"] | undefined | null,
	_in?: Array<ModelTypes["date"]> | undefined | null,
	_is_null?: boolean | undefined | null,
	_lt?: ModelTypes["date"] | undefined | null,
	_lte?: ModelTypes["date"] | undefined | null,
	_neq?: ModelTypes["date"] | undefined | null,
	_nin?: Array<ModelTypes["date"]> | undefined | null
};
	/** columns and relationships of "film" */
["film"]: {
		description?: string | undefined | null,
	film_id: number,
	fulltext: ModelTypes["tsvector"],
	language_id: ModelTypes["smallint"],
	last_update: ModelTypes["timestamp"],
	length?: ModelTypes["smallint"] | undefined | null,
	rating?: ModelTypes["mpaa_rating"] | undefined | null,
	release_year?: number | undefined | null,
	rental_duration: ModelTypes["smallint"],
	rental_rate: ModelTypes["numeric"],
	replacement_cost: ModelTypes["numeric"],
	special_features?: ModelTypes["_text"] | undefined | null,
	title: string
};
	/** columns and relationships of "film_actor" */
["film_actor"]: {
		actor_id: ModelTypes["smallint"],
	film_id: ModelTypes["smallint"],
	last_update: ModelTypes["timestamp"]
};
	/** aggregated selection of "film_actor" */
["film_actor_aggregate"]: {
		aggregate?: ModelTypes["film_actor_aggregate_fields"] | undefined | null,
	nodes: Array<ModelTypes["film_actor"]>
};
	/** aggregate fields of "film_actor" */
["film_actor_aggregate_fields"]: {
		avg?: ModelTypes["film_actor_avg_fields"] | undefined | null,
	count: number,
	max?: ModelTypes["film_actor_max_fields"] | undefined | null,
	min?: ModelTypes["film_actor_min_fields"] | undefined | null,
	stddev?: ModelTypes["film_actor_stddev_fields"] | undefined | null,
	stddev_pop?: ModelTypes["film_actor_stddev_pop_fields"] | undefined | null,
	stddev_samp?: ModelTypes["film_actor_stddev_samp_fields"] | undefined | null,
	sum?: ModelTypes["film_actor_sum_fields"] | undefined | null,
	var_pop?: ModelTypes["film_actor_var_pop_fields"] | undefined | null,
	var_samp?: ModelTypes["film_actor_var_samp_fields"] | undefined | null,
	variance?: ModelTypes["film_actor_variance_fields"] | undefined | null
};
	/** aggregate avg on columns */
["film_actor_avg_fields"]: {
		actor_id?: number | undefined | null,
	film_id?: number | undefined | null
};
	/** Boolean expression to filter rows from the table "film_actor". All fields are combined with a logical 'AND'. */
["film_actor_bool_exp"]: {
	_and?: Array<ModelTypes["film_actor_bool_exp"]> | undefined | null,
	_not?: ModelTypes["film_actor_bool_exp"] | undefined | null,
	_or?: Array<ModelTypes["film_actor_bool_exp"]> | undefined | null,
	actor_id?: ModelTypes["smallint_comparison_exp"] | undefined | null,
	film_id?: ModelTypes["smallint_comparison_exp"] | undefined | null,
	last_update?: ModelTypes["timestamp_comparison_exp"] | undefined | null
};
	["film_actor_constraint"]:film_actor_constraint;
	/** input type for incrementing numeric columns in table "film_actor" */
["film_actor_inc_input"]: {
	actor_id?: ModelTypes["smallint"] | undefined | null,
	film_id?: ModelTypes["smallint"] | undefined | null
};
	/** input type for inserting data into table "film_actor" */
["film_actor_insert_input"]: {
	actor_id?: ModelTypes["smallint"] | undefined | null,
	film_id?: ModelTypes["smallint"] | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null
};
	/** aggregate max on columns */
["film_actor_max_fields"]: {
		actor_id?: ModelTypes["smallint"] | undefined | null,
	film_id?: ModelTypes["smallint"] | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null
};
	/** aggregate min on columns */
["film_actor_min_fields"]: {
		actor_id?: ModelTypes["smallint"] | undefined | null,
	film_id?: ModelTypes["smallint"] | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null
};
	/** response of any mutation on the table "film_actor" */
["film_actor_mutation_response"]: {
		/** number of rows affected by the mutation */
	affected_rows: number,
	/** data from the rows affected by the mutation */
	returning: Array<ModelTypes["film_actor"]>
};
	/** on_conflict condition type for table "film_actor" */
["film_actor_on_conflict"]: {
	constraint: ModelTypes["film_actor_constraint"],
	update_columns: Array<ModelTypes["film_actor_update_column"]>,
	where?: ModelTypes["film_actor_bool_exp"] | undefined | null
};
	/** Ordering options when selecting data from "film_actor". */
["film_actor_order_by"]: {
	actor_id?: ModelTypes["order_by"] | undefined | null,
	film_id?: ModelTypes["order_by"] | undefined | null,
	last_update?: ModelTypes["order_by"] | undefined | null
};
	/** primary key columns input for table: film_actor */
["film_actor_pk_columns_input"]: {
	actor_id: ModelTypes["smallint"],
	film_id: ModelTypes["smallint"]
};
	["film_actor_select_column"]:film_actor_select_column;
	/** input type for updating data in table "film_actor" */
["film_actor_set_input"]: {
	actor_id?: ModelTypes["smallint"] | undefined | null,
	film_id?: ModelTypes["smallint"] | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null
};
	/** aggregate stddev on columns */
["film_actor_stddev_fields"]: {
		actor_id?: number | undefined | null,
	film_id?: number | undefined | null
};
	/** aggregate stddev_pop on columns */
["film_actor_stddev_pop_fields"]: {
		actor_id?: number | undefined | null,
	film_id?: number | undefined | null
};
	/** aggregate stddev_samp on columns */
["film_actor_stddev_samp_fields"]: {
		actor_id?: number | undefined | null,
	film_id?: number | undefined | null
};
	/** Streaming cursor of the table "film_actor" */
["film_actor_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ModelTypes["film_actor_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: ModelTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["film_actor_stream_cursor_value_input"]: {
	actor_id?: ModelTypes["smallint"] | undefined | null,
	film_id?: ModelTypes["smallint"] | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null
};
	/** aggregate sum on columns */
["film_actor_sum_fields"]: {
		actor_id?: ModelTypes["smallint"] | undefined | null,
	film_id?: ModelTypes["smallint"] | undefined | null
};
	["film_actor_update_column"]:film_actor_update_column;
	["film_actor_updates"]: {
	/** increments the numeric columns with given value of the filtered values */
	_inc?: ModelTypes["film_actor_inc_input"] | undefined | null,
	/** sets the columns of the filtered rows to the given values */
	_set?: ModelTypes["film_actor_set_input"] | undefined | null,
	/** filter the rows which have to be updated */
	where: ModelTypes["film_actor_bool_exp"]
};
	/** aggregate var_pop on columns */
["film_actor_var_pop_fields"]: {
		actor_id?: number | undefined | null,
	film_id?: number | undefined | null
};
	/** aggregate var_samp on columns */
["film_actor_var_samp_fields"]: {
		actor_id?: number | undefined | null,
	film_id?: number | undefined | null
};
	/** aggregate variance on columns */
["film_actor_variance_fields"]: {
		actor_id?: number | undefined | null,
	film_id?: number | undefined | null
};
	/** aggregated selection of "film" */
["film_aggregate"]: {
		aggregate?: ModelTypes["film_aggregate_fields"] | undefined | null,
	nodes: Array<ModelTypes["film"]>
};
	/** aggregate fields of "film" */
["film_aggregate_fields"]: {
		avg?: ModelTypes["film_avg_fields"] | undefined | null,
	count: number,
	max?: ModelTypes["film_max_fields"] | undefined | null,
	min?: ModelTypes["film_min_fields"] | undefined | null,
	stddev?: ModelTypes["film_stddev_fields"] | undefined | null,
	stddev_pop?: ModelTypes["film_stddev_pop_fields"] | undefined | null,
	stddev_samp?: ModelTypes["film_stddev_samp_fields"] | undefined | null,
	sum?: ModelTypes["film_sum_fields"] | undefined | null,
	var_pop?: ModelTypes["film_var_pop_fields"] | undefined | null,
	var_samp?: ModelTypes["film_var_samp_fields"] | undefined | null,
	variance?: ModelTypes["film_variance_fields"] | undefined | null
};
	/** aggregate avg on columns */
["film_avg_fields"]: {
		film_id?: number | undefined | null,
	language_id?: number | undefined | null,
	length?: number | undefined | null,
	release_year?: number | undefined | null,
	rental_duration?: number | undefined | null,
	rental_rate?: number | undefined | null,
	replacement_cost?: number | undefined | null
};
	/** Boolean expression to filter rows from the table "film". All fields are combined with a logical 'AND'. */
["film_bool_exp"]: {
	_and?: Array<ModelTypes["film_bool_exp"]> | undefined | null,
	_not?: ModelTypes["film_bool_exp"] | undefined | null,
	_or?: Array<ModelTypes["film_bool_exp"]> | undefined | null,
	description?: ModelTypes["String_comparison_exp"] | undefined | null,
	film_id?: ModelTypes["Int_comparison_exp"] | undefined | null,
	fulltext?: ModelTypes["tsvector_comparison_exp"] | undefined | null,
	language_id?: ModelTypes["smallint_comparison_exp"] | undefined | null,
	last_update?: ModelTypes["timestamp_comparison_exp"] | undefined | null,
	length?: ModelTypes["smallint_comparison_exp"] | undefined | null,
	rating?: ModelTypes["mpaa_rating_comparison_exp"] | undefined | null,
	release_year?: ModelTypes["Int_comparison_exp"] | undefined | null,
	rental_duration?: ModelTypes["smallint_comparison_exp"] | undefined | null,
	rental_rate?: ModelTypes["numeric_comparison_exp"] | undefined | null,
	replacement_cost?: ModelTypes["numeric_comparison_exp"] | undefined | null,
	special_features?: ModelTypes["_text_comparison_exp"] | undefined | null,
	title?: ModelTypes["String_comparison_exp"] | undefined | null
};
	/** columns and relationships of "film_category" */
["film_category"]: {
		category_id: ModelTypes["smallint"],
	film_id: ModelTypes["smallint"],
	last_update: ModelTypes["timestamp"]
};
	/** aggregated selection of "film_category" */
["film_category_aggregate"]: {
		aggregate?: ModelTypes["film_category_aggregate_fields"] | undefined | null,
	nodes: Array<ModelTypes["film_category"]>
};
	/** aggregate fields of "film_category" */
["film_category_aggregate_fields"]: {
		avg?: ModelTypes["film_category_avg_fields"] | undefined | null,
	count: number,
	max?: ModelTypes["film_category_max_fields"] | undefined | null,
	min?: ModelTypes["film_category_min_fields"] | undefined | null,
	stddev?: ModelTypes["film_category_stddev_fields"] | undefined | null,
	stddev_pop?: ModelTypes["film_category_stddev_pop_fields"] | undefined | null,
	stddev_samp?: ModelTypes["film_category_stddev_samp_fields"] | undefined | null,
	sum?: ModelTypes["film_category_sum_fields"] | undefined | null,
	var_pop?: ModelTypes["film_category_var_pop_fields"] | undefined | null,
	var_samp?: ModelTypes["film_category_var_samp_fields"] | undefined | null,
	variance?: ModelTypes["film_category_variance_fields"] | undefined | null
};
	/** aggregate avg on columns */
["film_category_avg_fields"]: {
		category_id?: number | undefined | null,
	film_id?: number | undefined | null
};
	/** Boolean expression to filter rows from the table "film_category". All fields are combined with a logical 'AND'. */
["film_category_bool_exp"]: {
	_and?: Array<ModelTypes["film_category_bool_exp"]> | undefined | null,
	_not?: ModelTypes["film_category_bool_exp"] | undefined | null,
	_or?: Array<ModelTypes["film_category_bool_exp"]> | undefined | null,
	category_id?: ModelTypes["smallint_comparison_exp"] | undefined | null,
	film_id?: ModelTypes["smallint_comparison_exp"] | undefined | null,
	last_update?: ModelTypes["timestamp_comparison_exp"] | undefined | null
};
	["film_category_constraint"]:film_category_constraint;
	/** input type for incrementing numeric columns in table "film_category" */
["film_category_inc_input"]: {
	category_id?: ModelTypes["smallint"] | undefined | null,
	film_id?: ModelTypes["smallint"] | undefined | null
};
	/** input type for inserting data into table "film_category" */
["film_category_insert_input"]: {
	category_id?: ModelTypes["smallint"] | undefined | null,
	film_id?: ModelTypes["smallint"] | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null
};
	/** aggregate max on columns */
["film_category_max_fields"]: {
		category_id?: ModelTypes["smallint"] | undefined | null,
	film_id?: ModelTypes["smallint"] | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null
};
	/** aggregate min on columns */
["film_category_min_fields"]: {
		category_id?: ModelTypes["smallint"] | undefined | null,
	film_id?: ModelTypes["smallint"] | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null
};
	/** response of any mutation on the table "film_category" */
["film_category_mutation_response"]: {
		/** number of rows affected by the mutation */
	affected_rows: number,
	/** data from the rows affected by the mutation */
	returning: Array<ModelTypes["film_category"]>
};
	/** on_conflict condition type for table "film_category" */
["film_category_on_conflict"]: {
	constraint: ModelTypes["film_category_constraint"],
	update_columns: Array<ModelTypes["film_category_update_column"]>,
	where?: ModelTypes["film_category_bool_exp"] | undefined | null
};
	/** Ordering options when selecting data from "film_category". */
["film_category_order_by"]: {
	category_id?: ModelTypes["order_by"] | undefined | null,
	film_id?: ModelTypes["order_by"] | undefined | null,
	last_update?: ModelTypes["order_by"] | undefined | null
};
	/** primary key columns input for table: film_category */
["film_category_pk_columns_input"]: {
	category_id: ModelTypes["smallint"],
	film_id: ModelTypes["smallint"]
};
	["film_category_select_column"]:film_category_select_column;
	/** input type for updating data in table "film_category" */
["film_category_set_input"]: {
	category_id?: ModelTypes["smallint"] | undefined | null,
	film_id?: ModelTypes["smallint"] | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null
};
	/** aggregate stddev on columns */
["film_category_stddev_fields"]: {
		category_id?: number | undefined | null,
	film_id?: number | undefined | null
};
	/** aggregate stddev_pop on columns */
["film_category_stddev_pop_fields"]: {
		category_id?: number | undefined | null,
	film_id?: number | undefined | null
};
	/** aggregate stddev_samp on columns */
["film_category_stddev_samp_fields"]: {
		category_id?: number | undefined | null,
	film_id?: number | undefined | null
};
	/** Streaming cursor of the table "film_category" */
["film_category_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ModelTypes["film_category_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: ModelTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["film_category_stream_cursor_value_input"]: {
	category_id?: ModelTypes["smallint"] | undefined | null,
	film_id?: ModelTypes["smallint"] | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null
};
	/** aggregate sum on columns */
["film_category_sum_fields"]: {
		category_id?: ModelTypes["smallint"] | undefined | null,
	film_id?: ModelTypes["smallint"] | undefined | null
};
	["film_category_update_column"]:film_category_update_column;
	["film_category_updates"]: {
	/** increments the numeric columns with given value of the filtered values */
	_inc?: ModelTypes["film_category_inc_input"] | undefined | null,
	/** sets the columns of the filtered rows to the given values */
	_set?: ModelTypes["film_category_set_input"] | undefined | null,
	/** filter the rows which have to be updated */
	where: ModelTypes["film_category_bool_exp"]
};
	/** aggregate var_pop on columns */
["film_category_var_pop_fields"]: {
		category_id?: number | undefined | null,
	film_id?: number | undefined | null
};
	/** aggregate var_samp on columns */
["film_category_var_samp_fields"]: {
		category_id?: number | undefined | null,
	film_id?: number | undefined | null
};
	/** aggregate variance on columns */
["film_category_variance_fields"]: {
		category_id?: number | undefined | null,
	film_id?: number | undefined | null
};
	["film_constraint"]:film_constraint;
	/** input type for incrementing numeric columns in table "film" */
["film_inc_input"]: {
	film_id?: number | undefined | null,
	language_id?: ModelTypes["smallint"] | undefined | null,
	length?: ModelTypes["smallint"] | undefined | null,
	release_year?: number | undefined | null,
	rental_duration?: ModelTypes["smallint"] | undefined | null,
	rental_rate?: ModelTypes["numeric"] | undefined | null,
	replacement_cost?: ModelTypes["numeric"] | undefined | null
};
	/** input type for inserting data into table "film" */
["film_insert_input"]: {
	description?: string | undefined | null,
	film_id?: number | undefined | null,
	fulltext?: ModelTypes["tsvector"] | undefined | null,
	language_id?: ModelTypes["smallint"] | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null,
	length?: ModelTypes["smallint"] | undefined | null,
	rating?: ModelTypes["mpaa_rating"] | undefined | null,
	release_year?: number | undefined | null,
	rental_duration?: ModelTypes["smallint"] | undefined | null,
	rental_rate?: ModelTypes["numeric"] | undefined | null,
	replacement_cost?: ModelTypes["numeric"] | undefined | null,
	special_features?: ModelTypes["_text"] | undefined | null,
	title?: string | undefined | null
};
	/** columns and relationships of "film_list" */
["film_list"]: {
		actors?: string | undefined | null,
	category?: string | undefined | null,
	description?: string | undefined | null,
	fid?: number | undefined | null,
	length?: ModelTypes["smallint"] | undefined | null,
	price?: ModelTypes["numeric"] | undefined | null,
	rating?: ModelTypes["mpaa_rating"] | undefined | null,
	title?: string | undefined | null
};
	/** aggregated selection of "film_list" */
["film_list_aggregate"]: {
		aggregate?: ModelTypes["film_list_aggregate_fields"] | undefined | null,
	nodes: Array<ModelTypes["film_list"]>
};
	/** aggregate fields of "film_list" */
["film_list_aggregate_fields"]: {
		avg?: ModelTypes["film_list_avg_fields"] | undefined | null,
	count: number,
	max?: ModelTypes["film_list_max_fields"] | undefined | null,
	min?: ModelTypes["film_list_min_fields"] | undefined | null,
	stddev?: ModelTypes["film_list_stddev_fields"] | undefined | null,
	stddev_pop?: ModelTypes["film_list_stddev_pop_fields"] | undefined | null,
	stddev_samp?: ModelTypes["film_list_stddev_samp_fields"] | undefined | null,
	sum?: ModelTypes["film_list_sum_fields"] | undefined | null,
	var_pop?: ModelTypes["film_list_var_pop_fields"] | undefined | null,
	var_samp?: ModelTypes["film_list_var_samp_fields"] | undefined | null,
	variance?: ModelTypes["film_list_variance_fields"] | undefined | null
};
	/** aggregate avg on columns */
["film_list_avg_fields"]: {
		fid?: number | undefined | null,
	length?: number | undefined | null,
	price?: number | undefined | null
};
	/** Boolean expression to filter rows from the table "film_list". All fields are combined with a logical 'AND'. */
["film_list_bool_exp"]: {
	_and?: Array<ModelTypes["film_list_bool_exp"]> | undefined | null,
	_not?: ModelTypes["film_list_bool_exp"] | undefined | null,
	_or?: Array<ModelTypes["film_list_bool_exp"]> | undefined | null,
	actors?: ModelTypes["String_comparison_exp"] | undefined | null,
	category?: ModelTypes["String_comparison_exp"] | undefined | null,
	description?: ModelTypes["String_comparison_exp"] | undefined | null,
	fid?: ModelTypes["Int_comparison_exp"] | undefined | null,
	length?: ModelTypes["smallint_comparison_exp"] | undefined | null,
	price?: ModelTypes["numeric_comparison_exp"] | undefined | null,
	rating?: ModelTypes["mpaa_rating_comparison_exp"] | undefined | null,
	title?: ModelTypes["String_comparison_exp"] | undefined | null
};
	/** aggregate max on columns */
["film_list_max_fields"]: {
		actors?: string | undefined | null,
	category?: string | undefined | null,
	description?: string | undefined | null,
	fid?: number | undefined | null,
	length?: ModelTypes["smallint"] | undefined | null,
	price?: ModelTypes["numeric"] | undefined | null,
	rating?: ModelTypes["mpaa_rating"] | undefined | null,
	title?: string | undefined | null
};
	/** aggregate min on columns */
["film_list_min_fields"]: {
		actors?: string | undefined | null,
	category?: string | undefined | null,
	description?: string | undefined | null,
	fid?: number | undefined | null,
	length?: ModelTypes["smallint"] | undefined | null,
	price?: ModelTypes["numeric"] | undefined | null,
	rating?: ModelTypes["mpaa_rating"] | undefined | null,
	title?: string | undefined | null
};
	/** Ordering options when selecting data from "film_list". */
["film_list_order_by"]: {
	actors?: ModelTypes["order_by"] | undefined | null,
	category?: ModelTypes["order_by"] | undefined | null,
	description?: ModelTypes["order_by"] | undefined | null,
	fid?: ModelTypes["order_by"] | undefined | null,
	length?: ModelTypes["order_by"] | undefined | null,
	price?: ModelTypes["order_by"] | undefined | null,
	rating?: ModelTypes["order_by"] | undefined | null,
	title?: ModelTypes["order_by"] | undefined | null
};
	["film_list_select_column"]:film_list_select_column;
	/** aggregate stddev on columns */
["film_list_stddev_fields"]: {
		fid?: number | undefined | null,
	length?: number | undefined | null,
	price?: number | undefined | null
};
	/** aggregate stddev_pop on columns */
["film_list_stddev_pop_fields"]: {
		fid?: number | undefined | null,
	length?: number | undefined | null,
	price?: number | undefined | null
};
	/** aggregate stddev_samp on columns */
["film_list_stddev_samp_fields"]: {
		fid?: number | undefined | null,
	length?: number | undefined | null,
	price?: number | undefined | null
};
	/** Streaming cursor of the table "film_list" */
["film_list_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ModelTypes["film_list_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: ModelTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["film_list_stream_cursor_value_input"]: {
	actors?: string | undefined | null,
	category?: string | undefined | null,
	description?: string | undefined | null,
	fid?: number | undefined | null,
	length?: ModelTypes["smallint"] | undefined | null,
	price?: ModelTypes["numeric"] | undefined | null,
	rating?: ModelTypes["mpaa_rating"] | undefined | null,
	title?: string | undefined | null
};
	/** aggregate sum on columns */
["film_list_sum_fields"]: {
		fid?: number | undefined | null,
	length?: ModelTypes["smallint"] | undefined | null,
	price?: ModelTypes["numeric"] | undefined | null
};
	/** aggregate var_pop on columns */
["film_list_var_pop_fields"]: {
		fid?: number | undefined | null,
	length?: number | undefined | null,
	price?: number | undefined | null
};
	/** aggregate var_samp on columns */
["film_list_var_samp_fields"]: {
		fid?: number | undefined | null,
	length?: number | undefined | null,
	price?: number | undefined | null
};
	/** aggregate variance on columns */
["film_list_variance_fields"]: {
		fid?: number | undefined | null,
	length?: number | undefined | null,
	price?: number | undefined | null
};
	/** aggregate max on columns */
["film_max_fields"]: {
		description?: string | undefined | null,
	film_id?: number | undefined | null,
	language_id?: ModelTypes["smallint"] | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null,
	length?: ModelTypes["smallint"] | undefined | null,
	rating?: ModelTypes["mpaa_rating"] | undefined | null,
	release_year?: number | undefined | null,
	rental_duration?: ModelTypes["smallint"] | undefined | null,
	rental_rate?: ModelTypes["numeric"] | undefined | null,
	replacement_cost?: ModelTypes["numeric"] | undefined | null,
	title?: string | undefined | null
};
	/** aggregate min on columns */
["film_min_fields"]: {
		description?: string | undefined | null,
	film_id?: number | undefined | null,
	language_id?: ModelTypes["smallint"] | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null,
	length?: ModelTypes["smallint"] | undefined | null,
	rating?: ModelTypes["mpaa_rating"] | undefined | null,
	release_year?: number | undefined | null,
	rental_duration?: ModelTypes["smallint"] | undefined | null,
	rental_rate?: ModelTypes["numeric"] | undefined | null,
	replacement_cost?: ModelTypes["numeric"] | undefined | null,
	title?: string | undefined | null
};
	/** response of any mutation on the table "film" */
["film_mutation_response"]: {
		/** number of rows affected by the mutation */
	affected_rows: number,
	/** data from the rows affected by the mutation */
	returning: Array<ModelTypes["film"]>
};
	/** on_conflict condition type for table "film" */
["film_on_conflict"]: {
	constraint: ModelTypes["film_constraint"],
	update_columns: Array<ModelTypes["film_update_column"]>,
	where?: ModelTypes["film_bool_exp"] | undefined | null
};
	/** Ordering options when selecting data from "film". */
["film_order_by"]: {
	description?: ModelTypes["order_by"] | undefined | null,
	film_id?: ModelTypes["order_by"] | undefined | null,
	fulltext?: ModelTypes["order_by"] | undefined | null,
	language_id?: ModelTypes["order_by"] | undefined | null,
	last_update?: ModelTypes["order_by"] | undefined | null,
	length?: ModelTypes["order_by"] | undefined | null,
	rating?: ModelTypes["order_by"] | undefined | null,
	release_year?: ModelTypes["order_by"] | undefined | null,
	rental_duration?: ModelTypes["order_by"] | undefined | null,
	rental_rate?: ModelTypes["order_by"] | undefined | null,
	replacement_cost?: ModelTypes["order_by"] | undefined | null,
	special_features?: ModelTypes["order_by"] | undefined | null,
	title?: ModelTypes["order_by"] | undefined | null
};
	/** primary key columns input for table: film */
["film_pk_columns_input"]: {
	film_id: number
};
	["film_select_column"]:film_select_column;
	/** input type for updating data in table "film" */
["film_set_input"]: {
	description?: string | undefined | null,
	film_id?: number | undefined | null,
	fulltext?: ModelTypes["tsvector"] | undefined | null,
	language_id?: ModelTypes["smallint"] | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null,
	length?: ModelTypes["smallint"] | undefined | null,
	rating?: ModelTypes["mpaa_rating"] | undefined | null,
	release_year?: number | undefined | null,
	rental_duration?: ModelTypes["smallint"] | undefined | null,
	rental_rate?: ModelTypes["numeric"] | undefined | null,
	replacement_cost?: ModelTypes["numeric"] | undefined | null,
	special_features?: ModelTypes["_text"] | undefined | null,
	title?: string | undefined | null
};
	/** aggregate stddev on columns */
["film_stddev_fields"]: {
		film_id?: number | undefined | null,
	language_id?: number | undefined | null,
	length?: number | undefined | null,
	release_year?: number | undefined | null,
	rental_duration?: number | undefined | null,
	rental_rate?: number | undefined | null,
	replacement_cost?: number | undefined | null
};
	/** aggregate stddev_pop on columns */
["film_stddev_pop_fields"]: {
		film_id?: number | undefined | null,
	language_id?: number | undefined | null,
	length?: number | undefined | null,
	release_year?: number | undefined | null,
	rental_duration?: number | undefined | null,
	rental_rate?: number | undefined | null,
	replacement_cost?: number | undefined | null
};
	/** aggregate stddev_samp on columns */
["film_stddev_samp_fields"]: {
		film_id?: number | undefined | null,
	language_id?: number | undefined | null,
	length?: number | undefined | null,
	release_year?: number | undefined | null,
	rental_duration?: number | undefined | null,
	rental_rate?: number | undefined | null,
	replacement_cost?: number | undefined | null
};
	/** Streaming cursor of the table "film" */
["film_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ModelTypes["film_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: ModelTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["film_stream_cursor_value_input"]: {
	description?: string | undefined | null,
	film_id?: number | undefined | null,
	fulltext?: ModelTypes["tsvector"] | undefined | null,
	language_id?: ModelTypes["smallint"] | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null,
	length?: ModelTypes["smallint"] | undefined | null,
	rating?: ModelTypes["mpaa_rating"] | undefined | null,
	release_year?: number | undefined | null,
	rental_duration?: ModelTypes["smallint"] | undefined | null,
	rental_rate?: ModelTypes["numeric"] | undefined | null,
	replacement_cost?: ModelTypes["numeric"] | undefined | null,
	special_features?: ModelTypes["_text"] | undefined | null,
	title?: string | undefined | null
};
	/** aggregate sum on columns */
["film_sum_fields"]: {
		film_id?: number | undefined | null,
	language_id?: ModelTypes["smallint"] | undefined | null,
	length?: ModelTypes["smallint"] | undefined | null,
	release_year?: number | undefined | null,
	rental_duration?: ModelTypes["smallint"] | undefined | null,
	rental_rate?: ModelTypes["numeric"] | undefined | null,
	replacement_cost?: ModelTypes["numeric"] | undefined | null
};
	["film_update_column"]:film_update_column;
	["film_updates"]: {
	/** increments the numeric columns with given value of the filtered values */
	_inc?: ModelTypes["film_inc_input"] | undefined | null,
	/** sets the columns of the filtered rows to the given values */
	_set?: ModelTypes["film_set_input"] | undefined | null,
	/** filter the rows which have to be updated */
	where: ModelTypes["film_bool_exp"]
};
	/** aggregate var_pop on columns */
["film_var_pop_fields"]: {
		film_id?: number | undefined | null,
	language_id?: number | undefined | null,
	length?: number | undefined | null,
	release_year?: number | undefined | null,
	rental_duration?: number | undefined | null,
	rental_rate?: number | undefined | null,
	replacement_cost?: number | undefined | null
};
	/** aggregate var_samp on columns */
["film_var_samp_fields"]: {
		film_id?: number | undefined | null,
	language_id?: number | undefined | null,
	length?: number | undefined | null,
	release_year?: number | undefined | null,
	rental_duration?: number | undefined | null,
	rental_rate?: number | undefined | null,
	replacement_cost?: number | undefined | null
};
	/** aggregate variance on columns */
["film_variance_fields"]: {
		film_id?: number | undefined | null,
	language_id?: number | undefined | null,
	length?: number | undefined | null,
	release_year?: number | undefined | null,
	rental_duration?: number | undefined | null,
	rental_rate?: number | undefined | null,
	replacement_cost?: number | undefined | null
};
	/** columns and relationships of "inventory" */
["inventory"]: {
		film_id: ModelTypes["smallint"],
	inventory_id: number,
	last_update: ModelTypes["timestamp"],
	store_id: ModelTypes["smallint"]
};
	/** aggregated selection of "inventory" */
["inventory_aggregate"]: {
		aggregate?: ModelTypes["inventory_aggregate_fields"] | undefined | null,
	nodes: Array<ModelTypes["inventory"]>
};
	/** aggregate fields of "inventory" */
["inventory_aggregate_fields"]: {
		avg?: ModelTypes["inventory_avg_fields"] | undefined | null,
	count: number,
	max?: ModelTypes["inventory_max_fields"] | undefined | null,
	min?: ModelTypes["inventory_min_fields"] | undefined | null,
	stddev?: ModelTypes["inventory_stddev_fields"] | undefined | null,
	stddev_pop?: ModelTypes["inventory_stddev_pop_fields"] | undefined | null,
	stddev_samp?: ModelTypes["inventory_stddev_samp_fields"] | undefined | null,
	sum?: ModelTypes["inventory_sum_fields"] | undefined | null,
	var_pop?: ModelTypes["inventory_var_pop_fields"] | undefined | null,
	var_samp?: ModelTypes["inventory_var_samp_fields"] | undefined | null,
	variance?: ModelTypes["inventory_variance_fields"] | undefined | null
};
	/** aggregate avg on columns */
["inventory_avg_fields"]: {
		film_id?: number | undefined | null,
	inventory_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	/** Boolean expression to filter rows from the table "inventory". All fields are combined with a logical 'AND'. */
["inventory_bool_exp"]: {
	_and?: Array<ModelTypes["inventory_bool_exp"]> | undefined | null,
	_not?: ModelTypes["inventory_bool_exp"] | undefined | null,
	_or?: Array<ModelTypes["inventory_bool_exp"]> | undefined | null,
	film_id?: ModelTypes["smallint_comparison_exp"] | undefined | null,
	inventory_id?: ModelTypes["Int_comparison_exp"] | undefined | null,
	last_update?: ModelTypes["timestamp_comparison_exp"] | undefined | null,
	store_id?: ModelTypes["smallint_comparison_exp"] | undefined | null
};
	["inventory_constraint"]:inventory_constraint;
	/** input type for incrementing numeric columns in table "inventory" */
["inventory_inc_input"]: {
	film_id?: ModelTypes["smallint"] | undefined | null,
	inventory_id?: number | undefined | null,
	store_id?: ModelTypes["smallint"] | undefined | null
};
	/** input type for inserting data into table "inventory" */
["inventory_insert_input"]: {
	film_id?: ModelTypes["smallint"] | undefined | null,
	inventory_id?: number | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null,
	store_id?: ModelTypes["smallint"] | undefined | null
};
	/** aggregate max on columns */
["inventory_max_fields"]: {
		film_id?: ModelTypes["smallint"] | undefined | null,
	inventory_id?: number | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null,
	store_id?: ModelTypes["smallint"] | undefined | null
};
	/** aggregate min on columns */
["inventory_min_fields"]: {
		film_id?: ModelTypes["smallint"] | undefined | null,
	inventory_id?: number | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null,
	store_id?: ModelTypes["smallint"] | undefined | null
};
	/** response of any mutation on the table "inventory" */
["inventory_mutation_response"]: {
		/** number of rows affected by the mutation */
	affected_rows: number,
	/** data from the rows affected by the mutation */
	returning: Array<ModelTypes["inventory"]>
};
	/** on_conflict condition type for table "inventory" */
["inventory_on_conflict"]: {
	constraint: ModelTypes["inventory_constraint"],
	update_columns: Array<ModelTypes["inventory_update_column"]>,
	where?: ModelTypes["inventory_bool_exp"] | undefined | null
};
	/** Ordering options when selecting data from "inventory". */
["inventory_order_by"]: {
	film_id?: ModelTypes["order_by"] | undefined | null,
	inventory_id?: ModelTypes["order_by"] | undefined | null,
	last_update?: ModelTypes["order_by"] | undefined | null,
	store_id?: ModelTypes["order_by"] | undefined | null
};
	/** primary key columns input for table: inventory */
["inventory_pk_columns_input"]: {
	inventory_id: number
};
	["inventory_select_column"]:inventory_select_column;
	/** input type for updating data in table "inventory" */
["inventory_set_input"]: {
	film_id?: ModelTypes["smallint"] | undefined | null,
	inventory_id?: number | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null,
	store_id?: ModelTypes["smallint"] | undefined | null
};
	/** aggregate stddev on columns */
["inventory_stddev_fields"]: {
		film_id?: number | undefined | null,
	inventory_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	/** aggregate stddev_pop on columns */
["inventory_stddev_pop_fields"]: {
		film_id?: number | undefined | null,
	inventory_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	/** aggregate stddev_samp on columns */
["inventory_stddev_samp_fields"]: {
		film_id?: number | undefined | null,
	inventory_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	/** Streaming cursor of the table "inventory" */
["inventory_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ModelTypes["inventory_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: ModelTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["inventory_stream_cursor_value_input"]: {
	film_id?: ModelTypes["smallint"] | undefined | null,
	inventory_id?: number | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null,
	store_id?: ModelTypes["smallint"] | undefined | null
};
	/** aggregate sum on columns */
["inventory_sum_fields"]: {
		film_id?: ModelTypes["smallint"] | undefined | null,
	inventory_id?: number | undefined | null,
	store_id?: ModelTypes["smallint"] | undefined | null
};
	["inventory_update_column"]:inventory_update_column;
	["inventory_updates"]: {
	/** increments the numeric columns with given value of the filtered values */
	_inc?: ModelTypes["inventory_inc_input"] | undefined | null,
	/** sets the columns of the filtered rows to the given values */
	_set?: ModelTypes["inventory_set_input"] | undefined | null,
	/** filter the rows which have to be updated */
	where: ModelTypes["inventory_bool_exp"]
};
	/** aggregate var_pop on columns */
["inventory_var_pop_fields"]: {
		film_id?: number | undefined | null,
	inventory_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	/** aggregate var_samp on columns */
["inventory_var_samp_fields"]: {
		film_id?: number | undefined | null,
	inventory_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	/** aggregate variance on columns */
["inventory_variance_fields"]: {
		film_id?: number | undefined | null,
	inventory_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	/** columns and relationships of "language" */
["language"]: {
		language_id: number,
	last_update: ModelTypes["timestamp"],
	name: ModelTypes["bpchar"]
};
	/** aggregated selection of "language" */
["language_aggregate"]: {
		aggregate?: ModelTypes["language_aggregate_fields"] | undefined | null,
	nodes: Array<ModelTypes["language"]>
};
	/** aggregate fields of "language" */
["language_aggregate_fields"]: {
		avg?: ModelTypes["language_avg_fields"] | undefined | null,
	count: number,
	max?: ModelTypes["language_max_fields"] | undefined | null,
	min?: ModelTypes["language_min_fields"] | undefined | null,
	stddev?: ModelTypes["language_stddev_fields"] | undefined | null,
	stddev_pop?: ModelTypes["language_stddev_pop_fields"] | undefined | null,
	stddev_samp?: ModelTypes["language_stddev_samp_fields"] | undefined | null,
	sum?: ModelTypes["language_sum_fields"] | undefined | null,
	var_pop?: ModelTypes["language_var_pop_fields"] | undefined | null,
	var_samp?: ModelTypes["language_var_samp_fields"] | undefined | null,
	variance?: ModelTypes["language_variance_fields"] | undefined | null
};
	/** aggregate avg on columns */
["language_avg_fields"]: {
		language_id?: number | undefined | null
};
	/** Boolean expression to filter rows from the table "language". All fields are combined with a logical 'AND'. */
["language_bool_exp"]: {
	_and?: Array<ModelTypes["language_bool_exp"]> | undefined | null,
	_not?: ModelTypes["language_bool_exp"] | undefined | null,
	_or?: Array<ModelTypes["language_bool_exp"]> | undefined | null,
	language_id?: ModelTypes["Int_comparison_exp"] | undefined | null,
	last_update?: ModelTypes["timestamp_comparison_exp"] | undefined | null,
	name?: ModelTypes["bpchar_comparison_exp"] | undefined | null
};
	["language_constraint"]:language_constraint;
	/** input type for incrementing numeric columns in table "language" */
["language_inc_input"]: {
	language_id?: number | undefined | null
};
	/** input type for inserting data into table "language" */
["language_insert_input"]: {
	language_id?: number | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null,
	name?: ModelTypes["bpchar"] | undefined | null
};
	/** aggregate max on columns */
["language_max_fields"]: {
		language_id?: number | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null,
	name?: ModelTypes["bpchar"] | undefined | null
};
	/** aggregate min on columns */
["language_min_fields"]: {
		language_id?: number | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null,
	name?: ModelTypes["bpchar"] | undefined | null
};
	/** response of any mutation on the table "language" */
["language_mutation_response"]: {
		/** number of rows affected by the mutation */
	affected_rows: number,
	/** data from the rows affected by the mutation */
	returning: Array<ModelTypes["language"]>
};
	/** on_conflict condition type for table "language" */
["language_on_conflict"]: {
	constraint: ModelTypes["language_constraint"],
	update_columns: Array<ModelTypes["language_update_column"]>,
	where?: ModelTypes["language_bool_exp"] | undefined | null
};
	/** Ordering options when selecting data from "language". */
["language_order_by"]: {
	language_id?: ModelTypes["order_by"] | undefined | null,
	last_update?: ModelTypes["order_by"] | undefined | null,
	name?: ModelTypes["order_by"] | undefined | null
};
	/** primary key columns input for table: language */
["language_pk_columns_input"]: {
	language_id: number
};
	["language_select_column"]:language_select_column;
	/** input type for updating data in table "language" */
["language_set_input"]: {
	language_id?: number | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null,
	name?: ModelTypes["bpchar"] | undefined | null
};
	/** aggregate stddev on columns */
["language_stddev_fields"]: {
		language_id?: number | undefined | null
};
	/** aggregate stddev_pop on columns */
["language_stddev_pop_fields"]: {
		language_id?: number | undefined | null
};
	/** aggregate stddev_samp on columns */
["language_stddev_samp_fields"]: {
		language_id?: number | undefined | null
};
	/** Streaming cursor of the table "language" */
["language_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ModelTypes["language_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: ModelTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["language_stream_cursor_value_input"]: {
	language_id?: number | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null,
	name?: ModelTypes["bpchar"] | undefined | null
};
	/** aggregate sum on columns */
["language_sum_fields"]: {
		language_id?: number | undefined | null
};
	["language_update_column"]:language_update_column;
	["language_updates"]: {
	/** increments the numeric columns with given value of the filtered values */
	_inc?: ModelTypes["language_inc_input"] | undefined | null,
	/** sets the columns of the filtered rows to the given values */
	_set?: ModelTypes["language_set_input"] | undefined | null,
	/** filter the rows which have to be updated */
	where: ModelTypes["language_bool_exp"]
};
	/** aggregate var_pop on columns */
["language_var_pop_fields"]: {
		language_id?: number | undefined | null
};
	/** aggregate var_samp on columns */
["language_var_samp_fields"]: {
		language_id?: number | undefined | null
};
	/** aggregate variance on columns */
["language_variance_fields"]: {
		language_id?: number | undefined | null
};
	["mpaa_rating"]:any;
	/** Boolean expression to compare columns of type "mpaa_rating". All fields are combined with logical 'AND'. */
["mpaa_rating_comparison_exp"]: {
	_eq?: ModelTypes["mpaa_rating"] | undefined | null,
	_gt?: ModelTypes["mpaa_rating"] | undefined | null,
	_gte?: ModelTypes["mpaa_rating"] | undefined | null,
	_in?: Array<ModelTypes["mpaa_rating"]> | undefined | null,
	_is_null?: boolean | undefined | null,
	_lt?: ModelTypes["mpaa_rating"] | undefined | null,
	_lte?: ModelTypes["mpaa_rating"] | undefined | null,
	_neq?: ModelTypes["mpaa_rating"] | undefined | null,
	_nin?: Array<ModelTypes["mpaa_rating"]> | undefined | null
};
	/** mutation root */
["mutation_root"]: {
		/** delete data from the table: "actor" */
	delete_actor?: ModelTypes["actor_mutation_response"] | undefined | null,
	/** delete single row from the table: "actor" */
	delete_actor_by_pk?: ModelTypes["actor"] | undefined | null,
	/** delete data from the table: "address" */
	delete_address?: ModelTypes["address_mutation_response"] | undefined | null,
	/** delete single row from the table: "address" */
	delete_address_by_pk?: ModelTypes["address"] | undefined | null,
	/** delete data from the table: "category" */
	delete_category?: ModelTypes["category_mutation_response"] | undefined | null,
	/** delete single row from the table: "category" */
	delete_category_by_pk?: ModelTypes["category"] | undefined | null,
	/** delete data from the table: "city" */
	delete_city?: ModelTypes["city_mutation_response"] | undefined | null,
	/** delete single row from the table: "city" */
	delete_city_by_pk?: ModelTypes["city"] | undefined | null,
	/** delete data from the table: "country" */
	delete_country?: ModelTypes["country_mutation_response"] | undefined | null,
	/** delete single row from the table: "country" */
	delete_country_by_pk?: ModelTypes["country"] | undefined | null,
	/** delete data from the table: "customer" */
	delete_customer?: ModelTypes["customer_mutation_response"] | undefined | null,
	/** delete single row from the table: "customer" */
	delete_customer_by_pk?: ModelTypes["customer"] | undefined | null,
	/** delete data from the table: "film" */
	delete_film?: ModelTypes["film_mutation_response"] | undefined | null,
	/** delete data from the table: "film_actor" */
	delete_film_actor?: ModelTypes["film_actor_mutation_response"] | undefined | null,
	/** delete single row from the table: "film_actor" */
	delete_film_actor_by_pk?: ModelTypes["film_actor"] | undefined | null,
	/** delete single row from the table: "film" */
	delete_film_by_pk?: ModelTypes["film"] | undefined | null,
	/** delete data from the table: "film_category" */
	delete_film_category?: ModelTypes["film_category_mutation_response"] | undefined | null,
	/** delete single row from the table: "film_category" */
	delete_film_category_by_pk?: ModelTypes["film_category"] | undefined | null,
	/** delete data from the table: "inventory" */
	delete_inventory?: ModelTypes["inventory_mutation_response"] | undefined | null,
	/** delete single row from the table: "inventory" */
	delete_inventory_by_pk?: ModelTypes["inventory"] | undefined | null,
	/** delete data from the table: "language" */
	delete_language?: ModelTypes["language_mutation_response"] | undefined | null,
	/** delete single row from the table: "language" */
	delete_language_by_pk?: ModelTypes["language"] | undefined | null,
	/** delete data from the table: "payment" */
	delete_payment?: ModelTypes["payment_mutation_response"] | undefined | null,
	/** delete single row from the table: "payment" */
	delete_payment_by_pk?: ModelTypes["payment"] | undefined | null,
	/** delete data from the table: "rental" */
	delete_rental?: ModelTypes["rental_mutation_response"] | undefined | null,
	/** delete single row from the table: "rental" */
	delete_rental_by_pk?: ModelTypes["rental"] | undefined | null,
	/** delete data from the table: "staff" */
	delete_staff?: ModelTypes["staff_mutation_response"] | undefined | null,
	/** delete single row from the table: "staff" */
	delete_staff_by_pk?: ModelTypes["staff"] | undefined | null,
	/** delete data from the table: "store" */
	delete_store?: ModelTypes["store_mutation_response"] | undefined | null,
	/** delete single row from the table: "store" */
	delete_store_by_pk?: ModelTypes["store"] | undefined | null,
	/** insert data into the table: "actor" */
	insert_actor?: ModelTypes["actor_mutation_response"] | undefined | null,
	/** insert a single row into the table: "actor" */
	insert_actor_one?: ModelTypes["actor"] | undefined | null,
	/** insert data into the table: "address" */
	insert_address?: ModelTypes["address_mutation_response"] | undefined | null,
	/** insert a single row into the table: "address" */
	insert_address_one?: ModelTypes["address"] | undefined | null,
	/** insert data into the table: "category" */
	insert_category?: ModelTypes["category_mutation_response"] | undefined | null,
	/** insert a single row into the table: "category" */
	insert_category_one?: ModelTypes["category"] | undefined | null,
	/** insert data into the table: "city" */
	insert_city?: ModelTypes["city_mutation_response"] | undefined | null,
	/** insert a single row into the table: "city" */
	insert_city_one?: ModelTypes["city"] | undefined | null,
	/** insert data into the table: "country" */
	insert_country?: ModelTypes["country_mutation_response"] | undefined | null,
	/** insert a single row into the table: "country" */
	insert_country_one?: ModelTypes["country"] | undefined | null,
	/** insert data into the table: "customer" */
	insert_customer?: ModelTypes["customer_mutation_response"] | undefined | null,
	/** insert a single row into the table: "customer" */
	insert_customer_one?: ModelTypes["customer"] | undefined | null,
	/** insert data into the table: "film" */
	insert_film?: ModelTypes["film_mutation_response"] | undefined | null,
	/** insert data into the table: "film_actor" */
	insert_film_actor?: ModelTypes["film_actor_mutation_response"] | undefined | null,
	/** insert a single row into the table: "film_actor" */
	insert_film_actor_one?: ModelTypes["film_actor"] | undefined | null,
	/** insert data into the table: "film_category" */
	insert_film_category?: ModelTypes["film_category_mutation_response"] | undefined | null,
	/** insert a single row into the table: "film_category" */
	insert_film_category_one?: ModelTypes["film_category"] | undefined | null,
	/** insert a single row into the table: "film" */
	insert_film_one?: ModelTypes["film"] | undefined | null,
	/** insert data into the table: "inventory" */
	insert_inventory?: ModelTypes["inventory_mutation_response"] | undefined | null,
	/** insert a single row into the table: "inventory" */
	insert_inventory_one?: ModelTypes["inventory"] | undefined | null,
	/** insert data into the table: "language" */
	insert_language?: ModelTypes["language_mutation_response"] | undefined | null,
	/** insert a single row into the table: "language" */
	insert_language_one?: ModelTypes["language"] | undefined | null,
	/** insert data into the table: "payment" */
	insert_payment?: ModelTypes["payment_mutation_response"] | undefined | null,
	/** insert a single row into the table: "payment" */
	insert_payment_one?: ModelTypes["payment"] | undefined | null,
	/** insert data into the table: "rental" */
	insert_rental?: ModelTypes["rental_mutation_response"] | undefined | null,
	/** insert a single row into the table: "rental" */
	insert_rental_one?: ModelTypes["rental"] | undefined | null,
	/** insert data into the table: "staff" */
	insert_staff?: ModelTypes["staff_mutation_response"] | undefined | null,
	/** insert a single row into the table: "staff" */
	insert_staff_one?: ModelTypes["staff"] | undefined | null,
	/** insert data into the table: "store" */
	insert_store?: ModelTypes["store_mutation_response"] | undefined | null,
	/** insert a single row into the table: "store" */
	insert_store_one?: ModelTypes["store"] | undefined | null,
	/** update data of the table: "actor" */
	update_actor?: ModelTypes["actor_mutation_response"] | undefined | null,
	/** update single row of the table: "actor" */
	update_actor_by_pk?: ModelTypes["actor"] | undefined | null,
	/** update multiples rows of table: "actor" */
	update_actor_many?: Array<ModelTypes["actor_mutation_response"] | undefined | null> | undefined | null,
	/** update data of the table: "address" */
	update_address?: ModelTypes["address_mutation_response"] | undefined | null,
	/** update single row of the table: "address" */
	update_address_by_pk?: ModelTypes["address"] | undefined | null,
	/** update multiples rows of table: "address" */
	update_address_many?: Array<ModelTypes["address_mutation_response"] | undefined | null> | undefined | null,
	/** update data of the table: "category" */
	update_category?: ModelTypes["category_mutation_response"] | undefined | null,
	/** update single row of the table: "category" */
	update_category_by_pk?: ModelTypes["category"] | undefined | null,
	/** update multiples rows of table: "category" */
	update_category_many?: Array<ModelTypes["category_mutation_response"] | undefined | null> | undefined | null,
	/** update data of the table: "city" */
	update_city?: ModelTypes["city_mutation_response"] | undefined | null,
	/** update single row of the table: "city" */
	update_city_by_pk?: ModelTypes["city"] | undefined | null,
	/** update multiples rows of table: "city" */
	update_city_many?: Array<ModelTypes["city_mutation_response"] | undefined | null> | undefined | null,
	/** update data of the table: "country" */
	update_country?: ModelTypes["country_mutation_response"] | undefined | null,
	/** update single row of the table: "country" */
	update_country_by_pk?: ModelTypes["country"] | undefined | null,
	/** update multiples rows of table: "country" */
	update_country_many?: Array<ModelTypes["country_mutation_response"] | undefined | null> | undefined | null,
	/** update data of the table: "customer" */
	update_customer?: ModelTypes["customer_mutation_response"] | undefined | null,
	/** update single row of the table: "customer" */
	update_customer_by_pk?: ModelTypes["customer"] | undefined | null,
	/** update multiples rows of table: "customer" */
	update_customer_many?: Array<ModelTypes["customer_mutation_response"] | undefined | null> | undefined | null,
	/** update data of the table: "film" */
	update_film?: ModelTypes["film_mutation_response"] | undefined | null,
	/** update data of the table: "film_actor" */
	update_film_actor?: ModelTypes["film_actor_mutation_response"] | undefined | null,
	/** update single row of the table: "film_actor" */
	update_film_actor_by_pk?: ModelTypes["film_actor"] | undefined | null,
	/** update multiples rows of table: "film_actor" */
	update_film_actor_many?: Array<ModelTypes["film_actor_mutation_response"] | undefined | null> | undefined | null,
	/** update single row of the table: "film" */
	update_film_by_pk?: ModelTypes["film"] | undefined | null,
	/** update data of the table: "film_category" */
	update_film_category?: ModelTypes["film_category_mutation_response"] | undefined | null,
	/** update single row of the table: "film_category" */
	update_film_category_by_pk?: ModelTypes["film_category"] | undefined | null,
	/** update multiples rows of table: "film_category" */
	update_film_category_many?: Array<ModelTypes["film_category_mutation_response"] | undefined | null> | undefined | null,
	/** update multiples rows of table: "film" */
	update_film_many?: Array<ModelTypes["film_mutation_response"] | undefined | null> | undefined | null,
	/** update data of the table: "inventory" */
	update_inventory?: ModelTypes["inventory_mutation_response"] | undefined | null,
	/** update single row of the table: "inventory" */
	update_inventory_by_pk?: ModelTypes["inventory"] | undefined | null,
	/** update multiples rows of table: "inventory" */
	update_inventory_many?: Array<ModelTypes["inventory_mutation_response"] | undefined | null> | undefined | null,
	/** update data of the table: "language" */
	update_language?: ModelTypes["language_mutation_response"] | undefined | null,
	/** update single row of the table: "language" */
	update_language_by_pk?: ModelTypes["language"] | undefined | null,
	/** update multiples rows of table: "language" */
	update_language_many?: Array<ModelTypes["language_mutation_response"] | undefined | null> | undefined | null,
	/** update data of the table: "payment" */
	update_payment?: ModelTypes["payment_mutation_response"] | undefined | null,
	/** update single row of the table: "payment" */
	update_payment_by_pk?: ModelTypes["payment"] | undefined | null,
	/** update multiples rows of table: "payment" */
	update_payment_many?: Array<ModelTypes["payment_mutation_response"] | undefined | null> | undefined | null,
	/** update data of the table: "rental" */
	update_rental?: ModelTypes["rental_mutation_response"] | undefined | null,
	/** update single row of the table: "rental" */
	update_rental_by_pk?: ModelTypes["rental"] | undefined | null,
	/** update multiples rows of table: "rental" */
	update_rental_many?: Array<ModelTypes["rental_mutation_response"] | undefined | null> | undefined | null,
	/** update data of the table: "staff" */
	update_staff?: ModelTypes["staff_mutation_response"] | undefined | null,
	/** update single row of the table: "staff" */
	update_staff_by_pk?: ModelTypes["staff"] | undefined | null,
	/** update multiples rows of table: "staff" */
	update_staff_many?: Array<ModelTypes["staff_mutation_response"] | undefined | null> | undefined | null,
	/** update data of the table: "store" */
	update_store?: ModelTypes["store_mutation_response"] | undefined | null,
	/** update single row of the table: "store" */
	update_store_by_pk?: ModelTypes["store"] | undefined | null,
	/** update multiples rows of table: "store" */
	update_store_many?: Array<ModelTypes["store_mutation_response"] | undefined | null> | undefined | null
};
	/** columns and relationships of "nicer_but_slower_film_list" */
["nicer_but_slower_film_list"]: {
		actors?: string | undefined | null,
	category?: string | undefined | null,
	description?: string | undefined | null,
	fid?: number | undefined | null,
	length?: ModelTypes["smallint"] | undefined | null,
	price?: ModelTypes["numeric"] | undefined | null,
	rating?: ModelTypes["mpaa_rating"] | undefined | null,
	title?: string | undefined | null
};
	/** aggregated selection of "nicer_but_slower_film_list" */
["nicer_but_slower_film_list_aggregate"]: {
		aggregate?: ModelTypes["nicer_but_slower_film_list_aggregate_fields"] | undefined | null,
	nodes: Array<ModelTypes["nicer_but_slower_film_list"]>
};
	/** aggregate fields of "nicer_but_slower_film_list" */
["nicer_but_slower_film_list_aggregate_fields"]: {
		avg?: ModelTypes["nicer_but_slower_film_list_avg_fields"] | undefined | null,
	count: number,
	max?: ModelTypes["nicer_but_slower_film_list_max_fields"] | undefined | null,
	min?: ModelTypes["nicer_but_slower_film_list_min_fields"] | undefined | null,
	stddev?: ModelTypes["nicer_but_slower_film_list_stddev_fields"] | undefined | null,
	stddev_pop?: ModelTypes["nicer_but_slower_film_list_stddev_pop_fields"] | undefined | null,
	stddev_samp?: ModelTypes["nicer_but_slower_film_list_stddev_samp_fields"] | undefined | null,
	sum?: ModelTypes["nicer_but_slower_film_list_sum_fields"] | undefined | null,
	var_pop?: ModelTypes["nicer_but_slower_film_list_var_pop_fields"] | undefined | null,
	var_samp?: ModelTypes["nicer_but_slower_film_list_var_samp_fields"] | undefined | null,
	variance?: ModelTypes["nicer_but_slower_film_list_variance_fields"] | undefined | null
};
	/** aggregate avg on columns */
["nicer_but_slower_film_list_avg_fields"]: {
		fid?: number | undefined | null,
	length?: number | undefined | null,
	price?: number | undefined | null
};
	/** Boolean expression to filter rows from the table "nicer_but_slower_film_list". All fields are combined with a logical 'AND'. */
["nicer_but_slower_film_list_bool_exp"]: {
	_and?: Array<ModelTypes["nicer_but_slower_film_list_bool_exp"]> | undefined | null,
	_not?: ModelTypes["nicer_but_slower_film_list_bool_exp"] | undefined | null,
	_or?: Array<ModelTypes["nicer_but_slower_film_list_bool_exp"]> | undefined | null,
	actors?: ModelTypes["String_comparison_exp"] | undefined | null,
	category?: ModelTypes["String_comparison_exp"] | undefined | null,
	description?: ModelTypes["String_comparison_exp"] | undefined | null,
	fid?: ModelTypes["Int_comparison_exp"] | undefined | null,
	length?: ModelTypes["smallint_comparison_exp"] | undefined | null,
	price?: ModelTypes["numeric_comparison_exp"] | undefined | null,
	rating?: ModelTypes["mpaa_rating_comparison_exp"] | undefined | null,
	title?: ModelTypes["String_comparison_exp"] | undefined | null
};
	/** aggregate max on columns */
["nicer_but_slower_film_list_max_fields"]: {
		actors?: string | undefined | null,
	category?: string | undefined | null,
	description?: string | undefined | null,
	fid?: number | undefined | null,
	length?: ModelTypes["smallint"] | undefined | null,
	price?: ModelTypes["numeric"] | undefined | null,
	rating?: ModelTypes["mpaa_rating"] | undefined | null,
	title?: string | undefined | null
};
	/** aggregate min on columns */
["nicer_but_slower_film_list_min_fields"]: {
		actors?: string | undefined | null,
	category?: string | undefined | null,
	description?: string | undefined | null,
	fid?: number | undefined | null,
	length?: ModelTypes["smallint"] | undefined | null,
	price?: ModelTypes["numeric"] | undefined | null,
	rating?: ModelTypes["mpaa_rating"] | undefined | null,
	title?: string | undefined | null
};
	/** Ordering options when selecting data from "nicer_but_slower_film_list". */
["nicer_but_slower_film_list_order_by"]: {
	actors?: ModelTypes["order_by"] | undefined | null,
	category?: ModelTypes["order_by"] | undefined | null,
	description?: ModelTypes["order_by"] | undefined | null,
	fid?: ModelTypes["order_by"] | undefined | null,
	length?: ModelTypes["order_by"] | undefined | null,
	price?: ModelTypes["order_by"] | undefined | null,
	rating?: ModelTypes["order_by"] | undefined | null,
	title?: ModelTypes["order_by"] | undefined | null
};
	["nicer_but_slower_film_list_select_column"]:nicer_but_slower_film_list_select_column;
	/** aggregate stddev on columns */
["nicer_but_slower_film_list_stddev_fields"]: {
		fid?: number | undefined | null,
	length?: number | undefined | null,
	price?: number | undefined | null
};
	/** aggregate stddev_pop on columns */
["nicer_but_slower_film_list_stddev_pop_fields"]: {
		fid?: number | undefined | null,
	length?: number | undefined | null,
	price?: number | undefined | null
};
	/** aggregate stddev_samp on columns */
["nicer_but_slower_film_list_stddev_samp_fields"]: {
		fid?: number | undefined | null,
	length?: number | undefined | null,
	price?: number | undefined | null
};
	/** Streaming cursor of the table "nicer_but_slower_film_list" */
["nicer_but_slower_film_list_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ModelTypes["nicer_but_slower_film_list_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: ModelTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["nicer_but_slower_film_list_stream_cursor_value_input"]: {
	actors?: string | undefined | null,
	category?: string | undefined | null,
	description?: string | undefined | null,
	fid?: number | undefined | null,
	length?: ModelTypes["smallint"] | undefined | null,
	price?: ModelTypes["numeric"] | undefined | null,
	rating?: ModelTypes["mpaa_rating"] | undefined | null,
	title?: string | undefined | null
};
	/** aggregate sum on columns */
["nicer_but_slower_film_list_sum_fields"]: {
		fid?: number | undefined | null,
	length?: ModelTypes["smallint"] | undefined | null,
	price?: ModelTypes["numeric"] | undefined | null
};
	/** aggregate var_pop on columns */
["nicer_but_slower_film_list_var_pop_fields"]: {
		fid?: number | undefined | null,
	length?: number | undefined | null,
	price?: number | undefined | null
};
	/** aggregate var_samp on columns */
["nicer_but_slower_film_list_var_samp_fields"]: {
		fid?: number | undefined | null,
	length?: number | undefined | null,
	price?: number | undefined | null
};
	/** aggregate variance on columns */
["nicer_but_slower_film_list_variance_fields"]: {
		fid?: number | undefined | null,
	length?: number | undefined | null,
	price?: number | undefined | null
};
	["numeric"]:any;
	/** Boolean expression to compare columns of type "numeric". All fields are combined with logical 'AND'. */
["numeric_comparison_exp"]: {
	_eq?: ModelTypes["numeric"] | undefined | null,
	_gt?: ModelTypes["numeric"] | undefined | null,
	_gte?: ModelTypes["numeric"] | undefined | null,
	_in?: Array<ModelTypes["numeric"]> | undefined | null,
	_is_null?: boolean | undefined | null,
	_lt?: ModelTypes["numeric"] | undefined | null,
	_lte?: ModelTypes["numeric"] | undefined | null,
	_neq?: ModelTypes["numeric"] | undefined | null,
	_nin?: Array<ModelTypes["numeric"]> | undefined | null
};
	["order_by"]:order_by;
	/** columns and relationships of "payment" */
["payment"]: {
		amount: ModelTypes["numeric"],
	customer_id: ModelTypes["smallint"],
	payment_date: ModelTypes["timestamp"],
	payment_id: number,
	rental_id: number,
	staff_id: ModelTypes["smallint"]
};
	/** aggregated selection of "payment" */
["payment_aggregate"]: {
		aggregate?: ModelTypes["payment_aggregate_fields"] | undefined | null,
	nodes: Array<ModelTypes["payment"]>
};
	/** aggregate fields of "payment" */
["payment_aggregate_fields"]: {
		avg?: ModelTypes["payment_avg_fields"] | undefined | null,
	count: number,
	max?: ModelTypes["payment_max_fields"] | undefined | null,
	min?: ModelTypes["payment_min_fields"] | undefined | null,
	stddev?: ModelTypes["payment_stddev_fields"] | undefined | null,
	stddev_pop?: ModelTypes["payment_stddev_pop_fields"] | undefined | null,
	stddev_samp?: ModelTypes["payment_stddev_samp_fields"] | undefined | null,
	sum?: ModelTypes["payment_sum_fields"] | undefined | null,
	var_pop?: ModelTypes["payment_var_pop_fields"] | undefined | null,
	var_samp?: ModelTypes["payment_var_samp_fields"] | undefined | null,
	variance?: ModelTypes["payment_variance_fields"] | undefined | null
};
	/** aggregate avg on columns */
["payment_avg_fields"]: {
		amount?: number | undefined | null,
	customer_id?: number | undefined | null,
	payment_id?: number | undefined | null,
	rental_id?: number | undefined | null,
	staff_id?: number | undefined | null
};
	/** Boolean expression to filter rows from the table "payment". All fields are combined with a logical 'AND'. */
["payment_bool_exp"]: {
	_and?: Array<ModelTypes["payment_bool_exp"]> | undefined | null,
	_not?: ModelTypes["payment_bool_exp"] | undefined | null,
	_or?: Array<ModelTypes["payment_bool_exp"]> | undefined | null,
	amount?: ModelTypes["numeric_comparison_exp"] | undefined | null,
	customer_id?: ModelTypes["smallint_comparison_exp"] | undefined | null,
	payment_date?: ModelTypes["timestamp_comparison_exp"] | undefined | null,
	payment_id?: ModelTypes["Int_comparison_exp"] | undefined | null,
	rental_id?: ModelTypes["Int_comparison_exp"] | undefined | null,
	staff_id?: ModelTypes["smallint_comparison_exp"] | undefined | null
};
	["payment_constraint"]:payment_constraint;
	/** input type for incrementing numeric columns in table "payment" */
["payment_inc_input"]: {
	amount?: ModelTypes["numeric"] | undefined | null,
	customer_id?: ModelTypes["smallint"] | undefined | null,
	payment_id?: number | undefined | null,
	rental_id?: number | undefined | null,
	staff_id?: ModelTypes["smallint"] | undefined | null
};
	/** input type for inserting data into table "payment" */
["payment_insert_input"]: {
	amount?: ModelTypes["numeric"] | undefined | null,
	customer_id?: ModelTypes["smallint"] | undefined | null,
	payment_date?: ModelTypes["timestamp"] | undefined | null,
	payment_id?: number | undefined | null,
	rental_id?: number | undefined | null,
	staff_id?: ModelTypes["smallint"] | undefined | null
};
	/** aggregate max on columns */
["payment_max_fields"]: {
		amount?: ModelTypes["numeric"] | undefined | null,
	customer_id?: ModelTypes["smallint"] | undefined | null,
	payment_date?: ModelTypes["timestamp"] | undefined | null,
	payment_id?: number | undefined | null,
	rental_id?: number | undefined | null,
	staff_id?: ModelTypes["smallint"] | undefined | null
};
	/** aggregate min on columns */
["payment_min_fields"]: {
		amount?: ModelTypes["numeric"] | undefined | null,
	customer_id?: ModelTypes["smallint"] | undefined | null,
	payment_date?: ModelTypes["timestamp"] | undefined | null,
	payment_id?: number | undefined | null,
	rental_id?: number | undefined | null,
	staff_id?: ModelTypes["smallint"] | undefined | null
};
	/** response of any mutation on the table "payment" */
["payment_mutation_response"]: {
		/** number of rows affected by the mutation */
	affected_rows: number,
	/** data from the rows affected by the mutation */
	returning: Array<ModelTypes["payment"]>
};
	/** on_conflict condition type for table "payment" */
["payment_on_conflict"]: {
	constraint: ModelTypes["payment_constraint"],
	update_columns: Array<ModelTypes["payment_update_column"]>,
	where?: ModelTypes["payment_bool_exp"] | undefined | null
};
	/** Ordering options when selecting data from "payment". */
["payment_order_by"]: {
	amount?: ModelTypes["order_by"] | undefined | null,
	customer_id?: ModelTypes["order_by"] | undefined | null,
	payment_date?: ModelTypes["order_by"] | undefined | null,
	payment_id?: ModelTypes["order_by"] | undefined | null,
	rental_id?: ModelTypes["order_by"] | undefined | null,
	staff_id?: ModelTypes["order_by"] | undefined | null
};
	/** primary key columns input for table: payment */
["payment_pk_columns_input"]: {
	payment_id: number
};
	["payment_select_column"]:payment_select_column;
	/** input type for updating data in table "payment" */
["payment_set_input"]: {
	amount?: ModelTypes["numeric"] | undefined | null,
	customer_id?: ModelTypes["smallint"] | undefined | null,
	payment_date?: ModelTypes["timestamp"] | undefined | null,
	payment_id?: number | undefined | null,
	rental_id?: number | undefined | null,
	staff_id?: ModelTypes["smallint"] | undefined | null
};
	/** aggregate stddev on columns */
["payment_stddev_fields"]: {
		amount?: number | undefined | null,
	customer_id?: number | undefined | null,
	payment_id?: number | undefined | null,
	rental_id?: number | undefined | null,
	staff_id?: number | undefined | null
};
	/** aggregate stddev_pop on columns */
["payment_stddev_pop_fields"]: {
		amount?: number | undefined | null,
	customer_id?: number | undefined | null,
	payment_id?: number | undefined | null,
	rental_id?: number | undefined | null,
	staff_id?: number | undefined | null
};
	/** aggregate stddev_samp on columns */
["payment_stddev_samp_fields"]: {
		amount?: number | undefined | null,
	customer_id?: number | undefined | null,
	payment_id?: number | undefined | null,
	rental_id?: number | undefined | null,
	staff_id?: number | undefined | null
};
	/** Streaming cursor of the table "payment" */
["payment_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ModelTypes["payment_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: ModelTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["payment_stream_cursor_value_input"]: {
	amount?: ModelTypes["numeric"] | undefined | null,
	customer_id?: ModelTypes["smallint"] | undefined | null,
	payment_date?: ModelTypes["timestamp"] | undefined | null,
	payment_id?: number | undefined | null,
	rental_id?: number | undefined | null,
	staff_id?: ModelTypes["smallint"] | undefined | null
};
	/** aggregate sum on columns */
["payment_sum_fields"]: {
		amount?: ModelTypes["numeric"] | undefined | null,
	customer_id?: ModelTypes["smallint"] | undefined | null,
	payment_id?: number | undefined | null,
	rental_id?: number | undefined | null,
	staff_id?: ModelTypes["smallint"] | undefined | null
};
	["payment_update_column"]:payment_update_column;
	["payment_updates"]: {
	/** increments the numeric columns with given value of the filtered values */
	_inc?: ModelTypes["payment_inc_input"] | undefined | null,
	/** sets the columns of the filtered rows to the given values */
	_set?: ModelTypes["payment_set_input"] | undefined | null,
	/** filter the rows which have to be updated */
	where: ModelTypes["payment_bool_exp"]
};
	/** aggregate var_pop on columns */
["payment_var_pop_fields"]: {
		amount?: number | undefined | null,
	customer_id?: number | undefined | null,
	payment_id?: number | undefined | null,
	rental_id?: number | undefined | null,
	staff_id?: number | undefined | null
};
	/** aggregate var_samp on columns */
["payment_var_samp_fields"]: {
		amount?: number | undefined | null,
	customer_id?: number | undefined | null,
	payment_id?: number | undefined | null,
	rental_id?: number | undefined | null,
	staff_id?: number | undefined | null
};
	/** aggregate variance on columns */
["payment_variance_fields"]: {
		amount?: number | undefined | null,
	customer_id?: number | undefined | null,
	payment_id?: number | undefined | null,
	rental_id?: number | undefined | null,
	staff_id?: number | undefined | null
};
	["query_root"]: {
		/** fetch data from the table: "actor" */
	actor: Array<ModelTypes["actor"]>,
	/** fetch aggregated fields from the table: "actor" */
	actor_aggregate: ModelTypes["actor_aggregate"],
	/** fetch data from the table: "actor" using primary key columns */
	actor_by_pk?: ModelTypes["actor"] | undefined | null,
	/** fetch data from the table: "actor_info" */
	actor_info: Array<ModelTypes["actor_info"]>,
	/** fetch aggregated fields from the table: "actor_info" */
	actor_info_aggregate: ModelTypes["actor_info_aggregate"],
	/** fetch data from the table: "address" */
	address: Array<ModelTypes["address"]>,
	/** fetch aggregated fields from the table: "address" */
	address_aggregate: ModelTypes["address_aggregate"],
	/** fetch data from the table: "address" using primary key columns */
	address_by_pk?: ModelTypes["address"] | undefined | null,
	/** fetch data from the table: "category" */
	category: Array<ModelTypes["category"]>,
	/** fetch aggregated fields from the table: "category" */
	category_aggregate: ModelTypes["category_aggregate"],
	/** fetch data from the table: "category" using primary key columns */
	category_by_pk?: ModelTypes["category"] | undefined | null,
	/** fetch data from the table: "city" */
	city: Array<ModelTypes["city"]>,
	/** fetch aggregated fields from the table: "city" */
	city_aggregate: ModelTypes["city_aggregate"],
	/** fetch data from the table: "city" using primary key columns */
	city_by_pk?: ModelTypes["city"] | undefined | null,
	/** fetch data from the table: "country" */
	country: Array<ModelTypes["country"]>,
	/** fetch aggregated fields from the table: "country" */
	country_aggregate: ModelTypes["country_aggregate"],
	/** fetch data from the table: "country" using primary key columns */
	country_by_pk?: ModelTypes["country"] | undefined | null,
	/** fetch data from the table: "customer" */
	customer: Array<ModelTypes["customer"]>,
	/** fetch aggregated fields from the table: "customer" */
	customer_aggregate: ModelTypes["customer_aggregate"],
	/** fetch data from the table: "customer" using primary key columns */
	customer_by_pk?: ModelTypes["customer"] | undefined | null,
	/** fetch data from the table: "customer_list" */
	customer_list: Array<ModelTypes["customer_list"]>,
	/** fetch aggregated fields from the table: "customer_list" */
	customer_list_aggregate: ModelTypes["customer_list_aggregate"],
	/** fetch data from the table: "film" */
	film: Array<ModelTypes["film"]>,
	/** fetch data from the table: "film_actor" */
	film_actor: Array<ModelTypes["film_actor"]>,
	/** fetch aggregated fields from the table: "film_actor" */
	film_actor_aggregate: ModelTypes["film_actor_aggregate"],
	/** fetch data from the table: "film_actor" using primary key columns */
	film_actor_by_pk?: ModelTypes["film_actor"] | undefined | null,
	/** fetch aggregated fields from the table: "film" */
	film_aggregate: ModelTypes["film_aggregate"],
	/** fetch data from the table: "film" using primary key columns */
	film_by_pk?: ModelTypes["film"] | undefined | null,
	/** fetch data from the table: "film_category" */
	film_category: Array<ModelTypes["film_category"]>,
	/** fetch aggregated fields from the table: "film_category" */
	film_category_aggregate: ModelTypes["film_category_aggregate"],
	/** fetch data from the table: "film_category" using primary key columns */
	film_category_by_pk?: ModelTypes["film_category"] | undefined | null,
	/** fetch data from the table: "film_list" */
	film_list: Array<ModelTypes["film_list"]>,
	/** fetch aggregated fields from the table: "film_list" */
	film_list_aggregate: ModelTypes["film_list_aggregate"],
	/** fetch data from the table: "inventory" */
	inventory: Array<ModelTypes["inventory"]>,
	/** fetch aggregated fields from the table: "inventory" */
	inventory_aggregate: ModelTypes["inventory_aggregate"],
	/** fetch data from the table: "inventory" using primary key columns */
	inventory_by_pk?: ModelTypes["inventory"] | undefined | null,
	/** fetch data from the table: "language" */
	language: Array<ModelTypes["language"]>,
	/** fetch aggregated fields from the table: "language" */
	language_aggregate: ModelTypes["language_aggregate"],
	/** fetch data from the table: "language" using primary key columns */
	language_by_pk?: ModelTypes["language"] | undefined | null,
	/** fetch data from the table: "nicer_but_slower_film_list" */
	nicer_but_slower_film_list: Array<ModelTypes["nicer_but_slower_film_list"]>,
	/** fetch aggregated fields from the table: "nicer_but_slower_film_list" */
	nicer_but_slower_film_list_aggregate: ModelTypes["nicer_but_slower_film_list_aggregate"],
	/** fetch data from the table: "payment" */
	payment: Array<ModelTypes["payment"]>,
	/** fetch aggregated fields from the table: "payment" */
	payment_aggregate: ModelTypes["payment_aggregate"],
	/** fetch data from the table: "payment" using primary key columns */
	payment_by_pk?: ModelTypes["payment"] | undefined | null,
	/** fetch data from the table: "rental" */
	rental: Array<ModelTypes["rental"]>,
	/** fetch aggregated fields from the table: "rental" */
	rental_aggregate: ModelTypes["rental_aggregate"],
	/** fetch data from the table: "rental" using primary key columns */
	rental_by_pk?: ModelTypes["rental"] | undefined | null,
	/** fetch data from the table: "sales_by_film_category" */
	sales_by_film_category: Array<ModelTypes["sales_by_film_category"]>,
	/** fetch aggregated fields from the table: "sales_by_film_category" */
	sales_by_film_category_aggregate: ModelTypes["sales_by_film_category_aggregate"],
	/** fetch data from the table: "sales_by_store" */
	sales_by_store: Array<ModelTypes["sales_by_store"]>,
	/** fetch aggregated fields from the table: "sales_by_store" */
	sales_by_store_aggregate: ModelTypes["sales_by_store_aggregate"],
	/** fetch data from the table: "staff" */
	staff: Array<ModelTypes["staff"]>,
	/** fetch aggregated fields from the table: "staff" */
	staff_aggregate: ModelTypes["staff_aggregate"],
	/** fetch data from the table: "staff" using primary key columns */
	staff_by_pk?: ModelTypes["staff"] | undefined | null,
	/** fetch data from the table: "staff_list" */
	staff_list: Array<ModelTypes["staff_list"]>,
	/** fetch aggregated fields from the table: "staff_list" */
	staff_list_aggregate: ModelTypes["staff_list_aggregate"],
	/** fetch data from the table: "store" */
	store: Array<ModelTypes["store"]>,
	/** fetch aggregated fields from the table: "store" */
	store_aggregate: ModelTypes["store_aggregate"],
	/** fetch data from the table: "store" using primary key columns */
	store_by_pk?: ModelTypes["store"] | undefined | null
};
	/** columns and relationships of "rental" */
["rental"]: {
		customer_id: ModelTypes["smallint"],
	inventory_id: number,
	last_update: ModelTypes["timestamp"],
	rental_date: ModelTypes["timestamp"],
	rental_id: number,
	return_date?: ModelTypes["timestamp"] | undefined | null,
	staff_id: ModelTypes["smallint"]
};
	/** aggregated selection of "rental" */
["rental_aggregate"]: {
		aggregate?: ModelTypes["rental_aggregate_fields"] | undefined | null,
	nodes: Array<ModelTypes["rental"]>
};
	/** aggregate fields of "rental" */
["rental_aggregate_fields"]: {
		avg?: ModelTypes["rental_avg_fields"] | undefined | null,
	count: number,
	max?: ModelTypes["rental_max_fields"] | undefined | null,
	min?: ModelTypes["rental_min_fields"] | undefined | null,
	stddev?: ModelTypes["rental_stddev_fields"] | undefined | null,
	stddev_pop?: ModelTypes["rental_stddev_pop_fields"] | undefined | null,
	stddev_samp?: ModelTypes["rental_stddev_samp_fields"] | undefined | null,
	sum?: ModelTypes["rental_sum_fields"] | undefined | null,
	var_pop?: ModelTypes["rental_var_pop_fields"] | undefined | null,
	var_samp?: ModelTypes["rental_var_samp_fields"] | undefined | null,
	variance?: ModelTypes["rental_variance_fields"] | undefined | null
};
	/** aggregate avg on columns */
["rental_avg_fields"]: {
		customer_id?: number | undefined | null,
	inventory_id?: number | undefined | null,
	rental_id?: number | undefined | null,
	staff_id?: number | undefined | null
};
	/** Boolean expression to filter rows from the table "rental". All fields are combined with a logical 'AND'. */
["rental_bool_exp"]: {
	_and?: Array<ModelTypes["rental_bool_exp"]> | undefined | null,
	_not?: ModelTypes["rental_bool_exp"] | undefined | null,
	_or?: Array<ModelTypes["rental_bool_exp"]> | undefined | null,
	customer_id?: ModelTypes["smallint_comparison_exp"] | undefined | null,
	inventory_id?: ModelTypes["Int_comparison_exp"] | undefined | null,
	last_update?: ModelTypes["timestamp_comparison_exp"] | undefined | null,
	rental_date?: ModelTypes["timestamp_comparison_exp"] | undefined | null,
	rental_id?: ModelTypes["Int_comparison_exp"] | undefined | null,
	return_date?: ModelTypes["timestamp_comparison_exp"] | undefined | null,
	staff_id?: ModelTypes["smallint_comparison_exp"] | undefined | null
};
	["rental_constraint"]:rental_constraint;
	/** input type for incrementing numeric columns in table "rental" */
["rental_inc_input"]: {
	customer_id?: ModelTypes["smallint"] | undefined | null,
	inventory_id?: number | undefined | null,
	rental_id?: number | undefined | null,
	staff_id?: ModelTypes["smallint"] | undefined | null
};
	/** input type for inserting data into table "rental" */
["rental_insert_input"]: {
	customer_id?: ModelTypes["smallint"] | undefined | null,
	inventory_id?: number | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null,
	rental_date?: ModelTypes["timestamp"] | undefined | null,
	rental_id?: number | undefined | null,
	return_date?: ModelTypes["timestamp"] | undefined | null,
	staff_id?: ModelTypes["smallint"] | undefined | null
};
	/** aggregate max on columns */
["rental_max_fields"]: {
		customer_id?: ModelTypes["smallint"] | undefined | null,
	inventory_id?: number | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null,
	rental_date?: ModelTypes["timestamp"] | undefined | null,
	rental_id?: number | undefined | null,
	return_date?: ModelTypes["timestamp"] | undefined | null,
	staff_id?: ModelTypes["smallint"] | undefined | null
};
	/** aggregate min on columns */
["rental_min_fields"]: {
		customer_id?: ModelTypes["smallint"] | undefined | null,
	inventory_id?: number | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null,
	rental_date?: ModelTypes["timestamp"] | undefined | null,
	rental_id?: number | undefined | null,
	return_date?: ModelTypes["timestamp"] | undefined | null,
	staff_id?: ModelTypes["smallint"] | undefined | null
};
	/** response of any mutation on the table "rental" */
["rental_mutation_response"]: {
		/** number of rows affected by the mutation */
	affected_rows: number,
	/** data from the rows affected by the mutation */
	returning: Array<ModelTypes["rental"]>
};
	/** on_conflict condition type for table "rental" */
["rental_on_conflict"]: {
	constraint: ModelTypes["rental_constraint"],
	update_columns: Array<ModelTypes["rental_update_column"]>,
	where?: ModelTypes["rental_bool_exp"] | undefined | null
};
	/** Ordering options when selecting data from "rental". */
["rental_order_by"]: {
	customer_id?: ModelTypes["order_by"] | undefined | null,
	inventory_id?: ModelTypes["order_by"] | undefined | null,
	last_update?: ModelTypes["order_by"] | undefined | null,
	rental_date?: ModelTypes["order_by"] | undefined | null,
	rental_id?: ModelTypes["order_by"] | undefined | null,
	return_date?: ModelTypes["order_by"] | undefined | null,
	staff_id?: ModelTypes["order_by"] | undefined | null
};
	/** primary key columns input for table: rental */
["rental_pk_columns_input"]: {
	rental_id: number
};
	["rental_select_column"]:rental_select_column;
	/** input type for updating data in table "rental" */
["rental_set_input"]: {
	customer_id?: ModelTypes["smallint"] | undefined | null,
	inventory_id?: number | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null,
	rental_date?: ModelTypes["timestamp"] | undefined | null,
	rental_id?: number | undefined | null,
	return_date?: ModelTypes["timestamp"] | undefined | null,
	staff_id?: ModelTypes["smallint"] | undefined | null
};
	/** aggregate stddev on columns */
["rental_stddev_fields"]: {
		customer_id?: number | undefined | null,
	inventory_id?: number | undefined | null,
	rental_id?: number | undefined | null,
	staff_id?: number | undefined | null
};
	/** aggregate stddev_pop on columns */
["rental_stddev_pop_fields"]: {
		customer_id?: number | undefined | null,
	inventory_id?: number | undefined | null,
	rental_id?: number | undefined | null,
	staff_id?: number | undefined | null
};
	/** aggregate stddev_samp on columns */
["rental_stddev_samp_fields"]: {
		customer_id?: number | undefined | null,
	inventory_id?: number | undefined | null,
	rental_id?: number | undefined | null,
	staff_id?: number | undefined | null
};
	/** Streaming cursor of the table "rental" */
["rental_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ModelTypes["rental_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: ModelTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["rental_stream_cursor_value_input"]: {
	customer_id?: ModelTypes["smallint"] | undefined | null,
	inventory_id?: number | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null,
	rental_date?: ModelTypes["timestamp"] | undefined | null,
	rental_id?: number | undefined | null,
	return_date?: ModelTypes["timestamp"] | undefined | null,
	staff_id?: ModelTypes["smallint"] | undefined | null
};
	/** aggregate sum on columns */
["rental_sum_fields"]: {
		customer_id?: ModelTypes["smallint"] | undefined | null,
	inventory_id?: number | undefined | null,
	rental_id?: number | undefined | null,
	staff_id?: ModelTypes["smallint"] | undefined | null
};
	["rental_update_column"]:rental_update_column;
	["rental_updates"]: {
	/** increments the numeric columns with given value of the filtered values */
	_inc?: ModelTypes["rental_inc_input"] | undefined | null,
	/** sets the columns of the filtered rows to the given values */
	_set?: ModelTypes["rental_set_input"] | undefined | null,
	/** filter the rows which have to be updated */
	where: ModelTypes["rental_bool_exp"]
};
	/** aggregate var_pop on columns */
["rental_var_pop_fields"]: {
		customer_id?: number | undefined | null,
	inventory_id?: number | undefined | null,
	rental_id?: number | undefined | null,
	staff_id?: number | undefined | null
};
	/** aggregate var_samp on columns */
["rental_var_samp_fields"]: {
		customer_id?: number | undefined | null,
	inventory_id?: number | undefined | null,
	rental_id?: number | undefined | null,
	staff_id?: number | undefined | null
};
	/** aggregate variance on columns */
["rental_variance_fields"]: {
		customer_id?: number | undefined | null,
	inventory_id?: number | undefined | null,
	rental_id?: number | undefined | null,
	staff_id?: number | undefined | null
};
	/** columns and relationships of "sales_by_film_category" */
["sales_by_film_category"]: {
		category?: string | undefined | null,
	total_sales?: ModelTypes["numeric"] | undefined | null
};
	/** aggregated selection of "sales_by_film_category" */
["sales_by_film_category_aggregate"]: {
		aggregate?: ModelTypes["sales_by_film_category_aggregate_fields"] | undefined | null,
	nodes: Array<ModelTypes["sales_by_film_category"]>
};
	/** aggregate fields of "sales_by_film_category" */
["sales_by_film_category_aggregate_fields"]: {
		avg?: ModelTypes["sales_by_film_category_avg_fields"] | undefined | null,
	count: number,
	max?: ModelTypes["sales_by_film_category_max_fields"] | undefined | null,
	min?: ModelTypes["sales_by_film_category_min_fields"] | undefined | null,
	stddev?: ModelTypes["sales_by_film_category_stddev_fields"] | undefined | null,
	stddev_pop?: ModelTypes["sales_by_film_category_stddev_pop_fields"] | undefined | null,
	stddev_samp?: ModelTypes["sales_by_film_category_stddev_samp_fields"] | undefined | null,
	sum?: ModelTypes["sales_by_film_category_sum_fields"] | undefined | null,
	var_pop?: ModelTypes["sales_by_film_category_var_pop_fields"] | undefined | null,
	var_samp?: ModelTypes["sales_by_film_category_var_samp_fields"] | undefined | null,
	variance?: ModelTypes["sales_by_film_category_variance_fields"] | undefined | null
};
	/** aggregate avg on columns */
["sales_by_film_category_avg_fields"]: {
		total_sales?: number | undefined | null
};
	/** Boolean expression to filter rows from the table "sales_by_film_category". All fields are combined with a logical 'AND'. */
["sales_by_film_category_bool_exp"]: {
	_and?: Array<ModelTypes["sales_by_film_category_bool_exp"]> | undefined | null,
	_not?: ModelTypes["sales_by_film_category_bool_exp"] | undefined | null,
	_or?: Array<ModelTypes["sales_by_film_category_bool_exp"]> | undefined | null,
	category?: ModelTypes["String_comparison_exp"] | undefined | null,
	total_sales?: ModelTypes["numeric_comparison_exp"] | undefined | null
};
	/** aggregate max on columns */
["sales_by_film_category_max_fields"]: {
		category?: string | undefined | null,
	total_sales?: ModelTypes["numeric"] | undefined | null
};
	/** aggregate min on columns */
["sales_by_film_category_min_fields"]: {
		category?: string | undefined | null,
	total_sales?: ModelTypes["numeric"] | undefined | null
};
	/** Ordering options when selecting data from "sales_by_film_category". */
["sales_by_film_category_order_by"]: {
	category?: ModelTypes["order_by"] | undefined | null,
	total_sales?: ModelTypes["order_by"] | undefined | null
};
	["sales_by_film_category_select_column"]:sales_by_film_category_select_column;
	/** aggregate stddev on columns */
["sales_by_film_category_stddev_fields"]: {
		total_sales?: number | undefined | null
};
	/** aggregate stddev_pop on columns */
["sales_by_film_category_stddev_pop_fields"]: {
		total_sales?: number | undefined | null
};
	/** aggregate stddev_samp on columns */
["sales_by_film_category_stddev_samp_fields"]: {
		total_sales?: number | undefined | null
};
	/** Streaming cursor of the table "sales_by_film_category" */
["sales_by_film_category_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ModelTypes["sales_by_film_category_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: ModelTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["sales_by_film_category_stream_cursor_value_input"]: {
	category?: string | undefined | null,
	total_sales?: ModelTypes["numeric"] | undefined | null
};
	/** aggregate sum on columns */
["sales_by_film_category_sum_fields"]: {
		total_sales?: ModelTypes["numeric"] | undefined | null
};
	/** aggregate var_pop on columns */
["sales_by_film_category_var_pop_fields"]: {
		total_sales?: number | undefined | null
};
	/** aggregate var_samp on columns */
["sales_by_film_category_var_samp_fields"]: {
		total_sales?: number | undefined | null
};
	/** aggregate variance on columns */
["sales_by_film_category_variance_fields"]: {
		total_sales?: number | undefined | null
};
	/** columns and relationships of "sales_by_store" */
["sales_by_store"]: {
		manager?: string | undefined | null,
	store?: string | undefined | null,
	total_sales?: ModelTypes["numeric"] | undefined | null
};
	/** aggregated selection of "sales_by_store" */
["sales_by_store_aggregate"]: {
		aggregate?: ModelTypes["sales_by_store_aggregate_fields"] | undefined | null,
	nodes: Array<ModelTypes["sales_by_store"]>
};
	/** aggregate fields of "sales_by_store" */
["sales_by_store_aggregate_fields"]: {
		avg?: ModelTypes["sales_by_store_avg_fields"] | undefined | null,
	count: number,
	max?: ModelTypes["sales_by_store_max_fields"] | undefined | null,
	min?: ModelTypes["sales_by_store_min_fields"] | undefined | null,
	stddev?: ModelTypes["sales_by_store_stddev_fields"] | undefined | null,
	stddev_pop?: ModelTypes["sales_by_store_stddev_pop_fields"] | undefined | null,
	stddev_samp?: ModelTypes["sales_by_store_stddev_samp_fields"] | undefined | null,
	sum?: ModelTypes["sales_by_store_sum_fields"] | undefined | null,
	var_pop?: ModelTypes["sales_by_store_var_pop_fields"] | undefined | null,
	var_samp?: ModelTypes["sales_by_store_var_samp_fields"] | undefined | null,
	variance?: ModelTypes["sales_by_store_variance_fields"] | undefined | null
};
	/** aggregate avg on columns */
["sales_by_store_avg_fields"]: {
		total_sales?: number | undefined | null
};
	/** Boolean expression to filter rows from the table "sales_by_store". All fields are combined with a logical 'AND'. */
["sales_by_store_bool_exp"]: {
	_and?: Array<ModelTypes["sales_by_store_bool_exp"]> | undefined | null,
	_not?: ModelTypes["sales_by_store_bool_exp"] | undefined | null,
	_or?: Array<ModelTypes["sales_by_store_bool_exp"]> | undefined | null,
	manager?: ModelTypes["String_comparison_exp"] | undefined | null,
	store?: ModelTypes["String_comparison_exp"] | undefined | null,
	total_sales?: ModelTypes["numeric_comparison_exp"] | undefined | null
};
	/** aggregate max on columns */
["sales_by_store_max_fields"]: {
		manager?: string | undefined | null,
	store?: string | undefined | null,
	total_sales?: ModelTypes["numeric"] | undefined | null
};
	/** aggregate min on columns */
["sales_by_store_min_fields"]: {
		manager?: string | undefined | null,
	store?: string | undefined | null,
	total_sales?: ModelTypes["numeric"] | undefined | null
};
	/** Ordering options when selecting data from "sales_by_store". */
["sales_by_store_order_by"]: {
	manager?: ModelTypes["order_by"] | undefined | null,
	store?: ModelTypes["order_by"] | undefined | null,
	total_sales?: ModelTypes["order_by"] | undefined | null
};
	["sales_by_store_select_column"]:sales_by_store_select_column;
	/** aggregate stddev on columns */
["sales_by_store_stddev_fields"]: {
		total_sales?: number | undefined | null
};
	/** aggregate stddev_pop on columns */
["sales_by_store_stddev_pop_fields"]: {
		total_sales?: number | undefined | null
};
	/** aggregate stddev_samp on columns */
["sales_by_store_stddev_samp_fields"]: {
		total_sales?: number | undefined | null
};
	/** Streaming cursor of the table "sales_by_store" */
["sales_by_store_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ModelTypes["sales_by_store_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: ModelTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["sales_by_store_stream_cursor_value_input"]: {
	manager?: string | undefined | null,
	store?: string | undefined | null,
	total_sales?: ModelTypes["numeric"] | undefined | null
};
	/** aggregate sum on columns */
["sales_by_store_sum_fields"]: {
		total_sales?: ModelTypes["numeric"] | undefined | null
};
	/** aggregate var_pop on columns */
["sales_by_store_var_pop_fields"]: {
		total_sales?: number | undefined | null
};
	/** aggregate var_samp on columns */
["sales_by_store_var_samp_fields"]: {
		total_sales?: number | undefined | null
};
	/** aggregate variance on columns */
["sales_by_store_variance_fields"]: {
		total_sales?: number | undefined | null
};
	["smallint"]:any;
	/** Boolean expression to compare columns of type "smallint". All fields are combined with logical 'AND'. */
["smallint_comparison_exp"]: {
	_eq?: ModelTypes["smallint"] | undefined | null,
	_gt?: ModelTypes["smallint"] | undefined | null,
	_gte?: ModelTypes["smallint"] | undefined | null,
	_in?: Array<ModelTypes["smallint"]> | undefined | null,
	_is_null?: boolean | undefined | null,
	_lt?: ModelTypes["smallint"] | undefined | null,
	_lte?: ModelTypes["smallint"] | undefined | null,
	_neq?: ModelTypes["smallint"] | undefined | null,
	_nin?: Array<ModelTypes["smallint"]> | undefined | null
};
	/** columns and relationships of "staff" */
["staff"]: {
		active: boolean,
	address_id: ModelTypes["smallint"],
	email?: string | undefined | null,
	first_name: string,
	last_name: string,
	last_update: ModelTypes["timestamp"],
	password?: string | undefined | null,
	picture?: ModelTypes["bytea"] | undefined | null,
	staff_id: number,
	store_id: ModelTypes["smallint"],
	username: string
};
	/** aggregated selection of "staff" */
["staff_aggregate"]: {
		aggregate?: ModelTypes["staff_aggregate_fields"] | undefined | null,
	nodes: Array<ModelTypes["staff"]>
};
	/** aggregate fields of "staff" */
["staff_aggregate_fields"]: {
		avg?: ModelTypes["staff_avg_fields"] | undefined | null,
	count: number,
	max?: ModelTypes["staff_max_fields"] | undefined | null,
	min?: ModelTypes["staff_min_fields"] | undefined | null,
	stddev?: ModelTypes["staff_stddev_fields"] | undefined | null,
	stddev_pop?: ModelTypes["staff_stddev_pop_fields"] | undefined | null,
	stddev_samp?: ModelTypes["staff_stddev_samp_fields"] | undefined | null,
	sum?: ModelTypes["staff_sum_fields"] | undefined | null,
	var_pop?: ModelTypes["staff_var_pop_fields"] | undefined | null,
	var_samp?: ModelTypes["staff_var_samp_fields"] | undefined | null,
	variance?: ModelTypes["staff_variance_fields"] | undefined | null
};
	/** aggregate avg on columns */
["staff_avg_fields"]: {
		address_id?: number | undefined | null,
	staff_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	/** Boolean expression to filter rows from the table "staff". All fields are combined with a logical 'AND'. */
["staff_bool_exp"]: {
	_and?: Array<ModelTypes["staff_bool_exp"]> | undefined | null,
	_not?: ModelTypes["staff_bool_exp"] | undefined | null,
	_or?: Array<ModelTypes["staff_bool_exp"]> | undefined | null,
	active?: ModelTypes["Boolean_comparison_exp"] | undefined | null,
	address_id?: ModelTypes["smallint_comparison_exp"] | undefined | null,
	email?: ModelTypes["String_comparison_exp"] | undefined | null,
	first_name?: ModelTypes["String_comparison_exp"] | undefined | null,
	last_name?: ModelTypes["String_comparison_exp"] | undefined | null,
	last_update?: ModelTypes["timestamp_comparison_exp"] | undefined | null,
	password?: ModelTypes["String_comparison_exp"] | undefined | null,
	picture?: ModelTypes["bytea_comparison_exp"] | undefined | null,
	staff_id?: ModelTypes["Int_comparison_exp"] | undefined | null,
	store_id?: ModelTypes["smallint_comparison_exp"] | undefined | null,
	username?: ModelTypes["String_comparison_exp"] | undefined | null
};
	["staff_constraint"]:staff_constraint;
	/** input type for incrementing numeric columns in table "staff" */
["staff_inc_input"]: {
	address_id?: ModelTypes["smallint"] | undefined | null,
	staff_id?: number | undefined | null,
	store_id?: ModelTypes["smallint"] | undefined | null
};
	/** input type for inserting data into table "staff" */
["staff_insert_input"]: {
	active?: boolean | undefined | null,
	address_id?: ModelTypes["smallint"] | undefined | null,
	email?: string | undefined | null,
	first_name?: string | undefined | null,
	last_name?: string | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null,
	password?: string | undefined | null,
	picture?: ModelTypes["bytea"] | undefined | null,
	staff_id?: number | undefined | null,
	store_id?: ModelTypes["smallint"] | undefined | null,
	username?: string | undefined | null
};
	/** columns and relationships of "staff_list" */
["staff_list"]: {
		address?: string | undefined | null,
	city?: string | undefined | null,
	country?: string | undefined | null,
	id?: number | undefined | null,
	name?: string | undefined | null,
	phone?: string | undefined | null,
	sid?: ModelTypes["smallint"] | undefined | null,
	zip_code?: string | undefined | null
};
	/** aggregated selection of "staff_list" */
["staff_list_aggregate"]: {
		aggregate?: ModelTypes["staff_list_aggregate_fields"] | undefined | null,
	nodes: Array<ModelTypes["staff_list"]>
};
	/** aggregate fields of "staff_list" */
["staff_list_aggregate_fields"]: {
		avg?: ModelTypes["staff_list_avg_fields"] | undefined | null,
	count: number,
	max?: ModelTypes["staff_list_max_fields"] | undefined | null,
	min?: ModelTypes["staff_list_min_fields"] | undefined | null,
	stddev?: ModelTypes["staff_list_stddev_fields"] | undefined | null,
	stddev_pop?: ModelTypes["staff_list_stddev_pop_fields"] | undefined | null,
	stddev_samp?: ModelTypes["staff_list_stddev_samp_fields"] | undefined | null,
	sum?: ModelTypes["staff_list_sum_fields"] | undefined | null,
	var_pop?: ModelTypes["staff_list_var_pop_fields"] | undefined | null,
	var_samp?: ModelTypes["staff_list_var_samp_fields"] | undefined | null,
	variance?: ModelTypes["staff_list_variance_fields"] | undefined | null
};
	/** aggregate avg on columns */
["staff_list_avg_fields"]: {
		id?: number | undefined | null,
	sid?: number | undefined | null
};
	/** Boolean expression to filter rows from the table "staff_list". All fields are combined with a logical 'AND'. */
["staff_list_bool_exp"]: {
	_and?: Array<ModelTypes["staff_list_bool_exp"]> | undefined | null,
	_not?: ModelTypes["staff_list_bool_exp"] | undefined | null,
	_or?: Array<ModelTypes["staff_list_bool_exp"]> | undefined | null,
	address?: ModelTypes["String_comparison_exp"] | undefined | null,
	city?: ModelTypes["String_comparison_exp"] | undefined | null,
	country?: ModelTypes["String_comparison_exp"] | undefined | null,
	id?: ModelTypes["Int_comparison_exp"] | undefined | null,
	name?: ModelTypes["String_comparison_exp"] | undefined | null,
	phone?: ModelTypes["String_comparison_exp"] | undefined | null,
	sid?: ModelTypes["smallint_comparison_exp"] | undefined | null,
	zip_code?: ModelTypes["String_comparison_exp"] | undefined | null
};
	/** aggregate max on columns */
["staff_list_max_fields"]: {
		address?: string | undefined | null,
	city?: string | undefined | null,
	country?: string | undefined | null,
	id?: number | undefined | null,
	name?: string | undefined | null,
	phone?: string | undefined | null,
	sid?: ModelTypes["smallint"] | undefined | null,
	zip_code?: string | undefined | null
};
	/** aggregate min on columns */
["staff_list_min_fields"]: {
		address?: string | undefined | null,
	city?: string | undefined | null,
	country?: string | undefined | null,
	id?: number | undefined | null,
	name?: string | undefined | null,
	phone?: string | undefined | null,
	sid?: ModelTypes["smallint"] | undefined | null,
	zip_code?: string | undefined | null
};
	/** Ordering options when selecting data from "staff_list". */
["staff_list_order_by"]: {
	address?: ModelTypes["order_by"] | undefined | null,
	city?: ModelTypes["order_by"] | undefined | null,
	country?: ModelTypes["order_by"] | undefined | null,
	id?: ModelTypes["order_by"] | undefined | null,
	name?: ModelTypes["order_by"] | undefined | null,
	phone?: ModelTypes["order_by"] | undefined | null,
	sid?: ModelTypes["order_by"] | undefined | null,
	zip_code?: ModelTypes["order_by"] | undefined | null
};
	["staff_list_select_column"]:staff_list_select_column;
	/** aggregate stddev on columns */
["staff_list_stddev_fields"]: {
		id?: number | undefined | null,
	sid?: number | undefined | null
};
	/** aggregate stddev_pop on columns */
["staff_list_stddev_pop_fields"]: {
		id?: number | undefined | null,
	sid?: number | undefined | null
};
	/** aggregate stddev_samp on columns */
["staff_list_stddev_samp_fields"]: {
		id?: number | undefined | null,
	sid?: number | undefined | null
};
	/** Streaming cursor of the table "staff_list" */
["staff_list_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ModelTypes["staff_list_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: ModelTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["staff_list_stream_cursor_value_input"]: {
	address?: string | undefined | null,
	city?: string | undefined | null,
	country?: string | undefined | null,
	id?: number | undefined | null,
	name?: string | undefined | null,
	phone?: string | undefined | null,
	sid?: ModelTypes["smallint"] | undefined | null,
	zip_code?: string | undefined | null
};
	/** aggregate sum on columns */
["staff_list_sum_fields"]: {
		id?: number | undefined | null,
	sid?: ModelTypes["smallint"] | undefined | null
};
	/** aggregate var_pop on columns */
["staff_list_var_pop_fields"]: {
		id?: number | undefined | null,
	sid?: number | undefined | null
};
	/** aggregate var_samp on columns */
["staff_list_var_samp_fields"]: {
		id?: number | undefined | null,
	sid?: number | undefined | null
};
	/** aggregate variance on columns */
["staff_list_variance_fields"]: {
		id?: number | undefined | null,
	sid?: number | undefined | null
};
	/** aggregate max on columns */
["staff_max_fields"]: {
		address_id?: ModelTypes["smallint"] | undefined | null,
	email?: string | undefined | null,
	first_name?: string | undefined | null,
	last_name?: string | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null,
	password?: string | undefined | null,
	staff_id?: number | undefined | null,
	store_id?: ModelTypes["smallint"] | undefined | null,
	username?: string | undefined | null
};
	/** aggregate min on columns */
["staff_min_fields"]: {
		address_id?: ModelTypes["smallint"] | undefined | null,
	email?: string | undefined | null,
	first_name?: string | undefined | null,
	last_name?: string | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null,
	password?: string | undefined | null,
	staff_id?: number | undefined | null,
	store_id?: ModelTypes["smallint"] | undefined | null,
	username?: string | undefined | null
};
	/** response of any mutation on the table "staff" */
["staff_mutation_response"]: {
		/** number of rows affected by the mutation */
	affected_rows: number,
	/** data from the rows affected by the mutation */
	returning: Array<ModelTypes["staff"]>
};
	/** on_conflict condition type for table "staff" */
["staff_on_conflict"]: {
	constraint: ModelTypes["staff_constraint"],
	update_columns: Array<ModelTypes["staff_update_column"]>,
	where?: ModelTypes["staff_bool_exp"] | undefined | null
};
	/** Ordering options when selecting data from "staff". */
["staff_order_by"]: {
	active?: ModelTypes["order_by"] | undefined | null,
	address_id?: ModelTypes["order_by"] | undefined | null,
	email?: ModelTypes["order_by"] | undefined | null,
	first_name?: ModelTypes["order_by"] | undefined | null,
	last_name?: ModelTypes["order_by"] | undefined | null,
	last_update?: ModelTypes["order_by"] | undefined | null,
	password?: ModelTypes["order_by"] | undefined | null,
	picture?: ModelTypes["order_by"] | undefined | null,
	staff_id?: ModelTypes["order_by"] | undefined | null,
	store_id?: ModelTypes["order_by"] | undefined | null,
	username?: ModelTypes["order_by"] | undefined | null
};
	/** primary key columns input for table: staff */
["staff_pk_columns_input"]: {
	staff_id: number
};
	["staff_select_column"]:staff_select_column;
	/** input type for updating data in table "staff" */
["staff_set_input"]: {
	active?: boolean | undefined | null,
	address_id?: ModelTypes["smallint"] | undefined | null,
	email?: string | undefined | null,
	first_name?: string | undefined | null,
	last_name?: string | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null,
	password?: string | undefined | null,
	picture?: ModelTypes["bytea"] | undefined | null,
	staff_id?: number | undefined | null,
	store_id?: ModelTypes["smallint"] | undefined | null,
	username?: string | undefined | null
};
	/** aggregate stddev on columns */
["staff_stddev_fields"]: {
		address_id?: number | undefined | null,
	staff_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	/** aggregate stddev_pop on columns */
["staff_stddev_pop_fields"]: {
		address_id?: number | undefined | null,
	staff_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	/** aggregate stddev_samp on columns */
["staff_stddev_samp_fields"]: {
		address_id?: number | undefined | null,
	staff_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	/** Streaming cursor of the table "staff" */
["staff_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ModelTypes["staff_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: ModelTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["staff_stream_cursor_value_input"]: {
	active?: boolean | undefined | null,
	address_id?: ModelTypes["smallint"] | undefined | null,
	email?: string | undefined | null,
	first_name?: string | undefined | null,
	last_name?: string | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null,
	password?: string | undefined | null,
	picture?: ModelTypes["bytea"] | undefined | null,
	staff_id?: number | undefined | null,
	store_id?: ModelTypes["smallint"] | undefined | null,
	username?: string | undefined | null
};
	/** aggregate sum on columns */
["staff_sum_fields"]: {
		address_id?: ModelTypes["smallint"] | undefined | null,
	staff_id?: number | undefined | null,
	store_id?: ModelTypes["smallint"] | undefined | null
};
	["staff_update_column"]:staff_update_column;
	["staff_updates"]: {
	/** increments the numeric columns with given value of the filtered values */
	_inc?: ModelTypes["staff_inc_input"] | undefined | null,
	/** sets the columns of the filtered rows to the given values */
	_set?: ModelTypes["staff_set_input"] | undefined | null,
	/** filter the rows which have to be updated */
	where: ModelTypes["staff_bool_exp"]
};
	/** aggregate var_pop on columns */
["staff_var_pop_fields"]: {
		address_id?: number | undefined | null,
	staff_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	/** aggregate var_samp on columns */
["staff_var_samp_fields"]: {
		address_id?: number | undefined | null,
	staff_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	/** aggregate variance on columns */
["staff_variance_fields"]: {
		address_id?: number | undefined | null,
	staff_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	/** columns and relationships of "store" */
["store"]: {
		address_id: ModelTypes["smallint"],
	last_update: ModelTypes["timestamp"],
	manager_staff_id: ModelTypes["smallint"],
	store_id: number
};
	/** aggregated selection of "store" */
["store_aggregate"]: {
		aggregate?: ModelTypes["store_aggregate_fields"] | undefined | null,
	nodes: Array<ModelTypes["store"]>
};
	/** aggregate fields of "store" */
["store_aggregate_fields"]: {
		avg?: ModelTypes["store_avg_fields"] | undefined | null,
	count: number,
	max?: ModelTypes["store_max_fields"] | undefined | null,
	min?: ModelTypes["store_min_fields"] | undefined | null,
	stddev?: ModelTypes["store_stddev_fields"] | undefined | null,
	stddev_pop?: ModelTypes["store_stddev_pop_fields"] | undefined | null,
	stddev_samp?: ModelTypes["store_stddev_samp_fields"] | undefined | null,
	sum?: ModelTypes["store_sum_fields"] | undefined | null,
	var_pop?: ModelTypes["store_var_pop_fields"] | undefined | null,
	var_samp?: ModelTypes["store_var_samp_fields"] | undefined | null,
	variance?: ModelTypes["store_variance_fields"] | undefined | null
};
	/** aggregate avg on columns */
["store_avg_fields"]: {
		address_id?: number | undefined | null,
	manager_staff_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	/** Boolean expression to filter rows from the table "store". All fields are combined with a logical 'AND'. */
["store_bool_exp"]: {
	_and?: Array<ModelTypes["store_bool_exp"]> | undefined | null,
	_not?: ModelTypes["store_bool_exp"] | undefined | null,
	_or?: Array<ModelTypes["store_bool_exp"]> | undefined | null,
	address_id?: ModelTypes["smallint_comparison_exp"] | undefined | null,
	last_update?: ModelTypes["timestamp_comparison_exp"] | undefined | null,
	manager_staff_id?: ModelTypes["smallint_comparison_exp"] | undefined | null,
	store_id?: ModelTypes["Int_comparison_exp"] | undefined | null
};
	["store_constraint"]:store_constraint;
	/** input type for incrementing numeric columns in table "store" */
["store_inc_input"]: {
	address_id?: ModelTypes["smallint"] | undefined | null,
	manager_staff_id?: ModelTypes["smallint"] | undefined | null,
	store_id?: number | undefined | null
};
	/** input type for inserting data into table "store" */
["store_insert_input"]: {
	address_id?: ModelTypes["smallint"] | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null,
	manager_staff_id?: ModelTypes["smallint"] | undefined | null,
	store_id?: number | undefined | null
};
	/** aggregate max on columns */
["store_max_fields"]: {
		address_id?: ModelTypes["smallint"] | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null,
	manager_staff_id?: ModelTypes["smallint"] | undefined | null,
	store_id?: number | undefined | null
};
	/** aggregate min on columns */
["store_min_fields"]: {
		address_id?: ModelTypes["smallint"] | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null,
	manager_staff_id?: ModelTypes["smallint"] | undefined | null,
	store_id?: number | undefined | null
};
	/** response of any mutation on the table "store" */
["store_mutation_response"]: {
		/** number of rows affected by the mutation */
	affected_rows: number,
	/** data from the rows affected by the mutation */
	returning: Array<ModelTypes["store"]>
};
	/** on_conflict condition type for table "store" */
["store_on_conflict"]: {
	constraint: ModelTypes["store_constraint"],
	update_columns: Array<ModelTypes["store_update_column"]>,
	where?: ModelTypes["store_bool_exp"] | undefined | null
};
	/** Ordering options when selecting data from "store". */
["store_order_by"]: {
	address_id?: ModelTypes["order_by"] | undefined | null,
	last_update?: ModelTypes["order_by"] | undefined | null,
	manager_staff_id?: ModelTypes["order_by"] | undefined | null,
	store_id?: ModelTypes["order_by"] | undefined | null
};
	/** primary key columns input for table: store */
["store_pk_columns_input"]: {
	store_id: number
};
	["store_select_column"]:store_select_column;
	/** input type for updating data in table "store" */
["store_set_input"]: {
	address_id?: ModelTypes["smallint"] | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null,
	manager_staff_id?: ModelTypes["smallint"] | undefined | null,
	store_id?: number | undefined | null
};
	/** aggregate stddev on columns */
["store_stddev_fields"]: {
		address_id?: number | undefined | null,
	manager_staff_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	/** aggregate stddev_pop on columns */
["store_stddev_pop_fields"]: {
		address_id?: number | undefined | null,
	manager_staff_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	/** aggregate stddev_samp on columns */
["store_stddev_samp_fields"]: {
		address_id?: number | undefined | null,
	manager_staff_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	/** Streaming cursor of the table "store" */
["store_stream_cursor_input"]: {
	/** Stream column input with initial value */
	initial_value: ModelTypes["store_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: ModelTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["store_stream_cursor_value_input"]: {
	address_id?: ModelTypes["smallint"] | undefined | null,
	last_update?: ModelTypes["timestamp"] | undefined | null,
	manager_staff_id?: ModelTypes["smallint"] | undefined | null,
	store_id?: number | undefined | null
};
	/** aggregate sum on columns */
["store_sum_fields"]: {
		address_id?: ModelTypes["smallint"] | undefined | null,
	manager_staff_id?: ModelTypes["smallint"] | undefined | null,
	store_id?: number | undefined | null
};
	["store_update_column"]:store_update_column;
	["store_updates"]: {
	/** increments the numeric columns with given value of the filtered values */
	_inc?: ModelTypes["store_inc_input"] | undefined | null,
	/** sets the columns of the filtered rows to the given values */
	_set?: ModelTypes["store_set_input"] | undefined | null,
	/** filter the rows which have to be updated */
	where: ModelTypes["store_bool_exp"]
};
	/** aggregate var_pop on columns */
["store_var_pop_fields"]: {
		address_id?: number | undefined | null,
	manager_staff_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	/** aggregate var_samp on columns */
["store_var_samp_fields"]: {
		address_id?: number | undefined | null,
	manager_staff_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	/** aggregate variance on columns */
["store_variance_fields"]: {
		address_id?: number | undefined | null,
	manager_staff_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	["subscription_root"]: {
		/** fetch data from the table: "actor" */
	actor: Array<ModelTypes["actor"]>,
	/** fetch aggregated fields from the table: "actor" */
	actor_aggregate: ModelTypes["actor_aggregate"],
	/** fetch data from the table: "actor" using primary key columns */
	actor_by_pk?: ModelTypes["actor"] | undefined | null,
	/** fetch data from the table: "actor_info" */
	actor_info: Array<ModelTypes["actor_info"]>,
	/** fetch aggregated fields from the table: "actor_info" */
	actor_info_aggregate: ModelTypes["actor_info_aggregate"],
	/** fetch data from the table in a streaming manner: "actor_info" */
	actor_info_stream: Array<ModelTypes["actor_info"]>,
	/** fetch data from the table in a streaming manner: "actor" */
	actor_stream: Array<ModelTypes["actor"]>,
	/** fetch data from the table: "address" */
	address: Array<ModelTypes["address"]>,
	/** fetch aggregated fields from the table: "address" */
	address_aggregate: ModelTypes["address_aggregate"],
	/** fetch data from the table: "address" using primary key columns */
	address_by_pk?: ModelTypes["address"] | undefined | null,
	/** fetch data from the table in a streaming manner: "address" */
	address_stream: Array<ModelTypes["address"]>,
	/** fetch data from the table: "category" */
	category: Array<ModelTypes["category"]>,
	/** fetch aggregated fields from the table: "category" */
	category_aggregate: ModelTypes["category_aggregate"],
	/** fetch data from the table: "category" using primary key columns */
	category_by_pk?: ModelTypes["category"] | undefined | null,
	/** fetch data from the table in a streaming manner: "category" */
	category_stream: Array<ModelTypes["category"]>,
	/** fetch data from the table: "city" */
	city: Array<ModelTypes["city"]>,
	/** fetch aggregated fields from the table: "city" */
	city_aggregate: ModelTypes["city_aggregate"],
	/** fetch data from the table: "city" using primary key columns */
	city_by_pk?: ModelTypes["city"] | undefined | null,
	/** fetch data from the table in a streaming manner: "city" */
	city_stream: Array<ModelTypes["city"]>,
	/** fetch data from the table: "country" */
	country: Array<ModelTypes["country"]>,
	/** fetch aggregated fields from the table: "country" */
	country_aggregate: ModelTypes["country_aggregate"],
	/** fetch data from the table: "country" using primary key columns */
	country_by_pk?: ModelTypes["country"] | undefined | null,
	/** fetch data from the table in a streaming manner: "country" */
	country_stream: Array<ModelTypes["country"]>,
	/** fetch data from the table: "customer" */
	customer: Array<ModelTypes["customer"]>,
	/** fetch aggregated fields from the table: "customer" */
	customer_aggregate: ModelTypes["customer_aggregate"],
	/** fetch data from the table: "customer" using primary key columns */
	customer_by_pk?: ModelTypes["customer"] | undefined | null,
	/** fetch data from the table: "customer_list" */
	customer_list: Array<ModelTypes["customer_list"]>,
	/** fetch aggregated fields from the table: "customer_list" */
	customer_list_aggregate: ModelTypes["customer_list_aggregate"],
	/** fetch data from the table in a streaming manner: "customer_list" */
	customer_list_stream: Array<ModelTypes["customer_list"]>,
	/** fetch data from the table in a streaming manner: "customer" */
	customer_stream: Array<ModelTypes["customer"]>,
	/** fetch data from the table: "film" */
	film: Array<ModelTypes["film"]>,
	/** fetch data from the table: "film_actor" */
	film_actor: Array<ModelTypes["film_actor"]>,
	/** fetch aggregated fields from the table: "film_actor" */
	film_actor_aggregate: ModelTypes["film_actor_aggregate"],
	/** fetch data from the table: "film_actor" using primary key columns */
	film_actor_by_pk?: ModelTypes["film_actor"] | undefined | null,
	/** fetch data from the table in a streaming manner: "film_actor" */
	film_actor_stream: Array<ModelTypes["film_actor"]>,
	/** fetch aggregated fields from the table: "film" */
	film_aggregate: ModelTypes["film_aggregate"],
	/** fetch data from the table: "film" using primary key columns */
	film_by_pk?: ModelTypes["film"] | undefined | null,
	/** fetch data from the table: "film_category" */
	film_category: Array<ModelTypes["film_category"]>,
	/** fetch aggregated fields from the table: "film_category" */
	film_category_aggregate: ModelTypes["film_category_aggregate"],
	/** fetch data from the table: "film_category" using primary key columns */
	film_category_by_pk?: ModelTypes["film_category"] | undefined | null,
	/** fetch data from the table in a streaming manner: "film_category" */
	film_category_stream: Array<ModelTypes["film_category"]>,
	/** fetch data from the table: "film_list" */
	film_list: Array<ModelTypes["film_list"]>,
	/** fetch aggregated fields from the table: "film_list" */
	film_list_aggregate: ModelTypes["film_list_aggregate"],
	/** fetch data from the table in a streaming manner: "film_list" */
	film_list_stream: Array<ModelTypes["film_list"]>,
	/** fetch data from the table in a streaming manner: "film" */
	film_stream: Array<ModelTypes["film"]>,
	/** fetch data from the table: "inventory" */
	inventory: Array<ModelTypes["inventory"]>,
	/** fetch aggregated fields from the table: "inventory" */
	inventory_aggregate: ModelTypes["inventory_aggregate"],
	/** fetch data from the table: "inventory" using primary key columns */
	inventory_by_pk?: ModelTypes["inventory"] | undefined | null,
	/** fetch data from the table in a streaming manner: "inventory" */
	inventory_stream: Array<ModelTypes["inventory"]>,
	/** fetch data from the table: "language" */
	language: Array<ModelTypes["language"]>,
	/** fetch aggregated fields from the table: "language" */
	language_aggregate: ModelTypes["language_aggregate"],
	/** fetch data from the table: "language" using primary key columns */
	language_by_pk?: ModelTypes["language"] | undefined | null,
	/** fetch data from the table in a streaming manner: "language" */
	language_stream: Array<ModelTypes["language"]>,
	/** fetch data from the table: "nicer_but_slower_film_list" */
	nicer_but_slower_film_list: Array<ModelTypes["nicer_but_slower_film_list"]>,
	/** fetch aggregated fields from the table: "nicer_but_slower_film_list" */
	nicer_but_slower_film_list_aggregate: ModelTypes["nicer_but_slower_film_list_aggregate"],
	/** fetch data from the table in a streaming manner: "nicer_but_slower_film_list" */
	nicer_but_slower_film_list_stream: Array<ModelTypes["nicer_but_slower_film_list"]>,
	/** fetch data from the table: "payment" */
	payment: Array<ModelTypes["payment"]>,
	/** fetch aggregated fields from the table: "payment" */
	payment_aggregate: ModelTypes["payment_aggregate"],
	/** fetch data from the table: "payment" using primary key columns */
	payment_by_pk?: ModelTypes["payment"] | undefined | null,
	/** fetch data from the table in a streaming manner: "payment" */
	payment_stream: Array<ModelTypes["payment"]>,
	/** fetch data from the table: "rental" */
	rental: Array<ModelTypes["rental"]>,
	/** fetch aggregated fields from the table: "rental" */
	rental_aggregate: ModelTypes["rental_aggregate"],
	/** fetch data from the table: "rental" using primary key columns */
	rental_by_pk?: ModelTypes["rental"] | undefined | null,
	/** fetch data from the table in a streaming manner: "rental" */
	rental_stream: Array<ModelTypes["rental"]>,
	/** fetch data from the table: "sales_by_film_category" */
	sales_by_film_category: Array<ModelTypes["sales_by_film_category"]>,
	/** fetch aggregated fields from the table: "sales_by_film_category" */
	sales_by_film_category_aggregate: ModelTypes["sales_by_film_category_aggregate"],
	/** fetch data from the table in a streaming manner: "sales_by_film_category" */
	sales_by_film_category_stream: Array<ModelTypes["sales_by_film_category"]>,
	/** fetch data from the table: "sales_by_store" */
	sales_by_store: Array<ModelTypes["sales_by_store"]>,
	/** fetch aggregated fields from the table: "sales_by_store" */
	sales_by_store_aggregate: ModelTypes["sales_by_store_aggregate"],
	/** fetch data from the table in a streaming manner: "sales_by_store" */
	sales_by_store_stream: Array<ModelTypes["sales_by_store"]>,
	/** fetch data from the table: "staff" */
	staff: Array<ModelTypes["staff"]>,
	/** fetch aggregated fields from the table: "staff" */
	staff_aggregate: ModelTypes["staff_aggregate"],
	/** fetch data from the table: "staff" using primary key columns */
	staff_by_pk?: ModelTypes["staff"] | undefined | null,
	/** fetch data from the table: "staff_list" */
	staff_list: Array<ModelTypes["staff_list"]>,
	/** fetch aggregated fields from the table: "staff_list" */
	staff_list_aggregate: ModelTypes["staff_list_aggregate"],
	/** fetch data from the table in a streaming manner: "staff_list" */
	staff_list_stream: Array<ModelTypes["staff_list"]>,
	/** fetch data from the table in a streaming manner: "staff" */
	staff_stream: Array<ModelTypes["staff"]>,
	/** fetch data from the table: "store" */
	store: Array<ModelTypes["store"]>,
	/** fetch aggregated fields from the table: "store" */
	store_aggregate: ModelTypes["store_aggregate"],
	/** fetch data from the table: "store" using primary key columns */
	store_by_pk?: ModelTypes["store"] | undefined | null,
	/** fetch data from the table in a streaming manner: "store" */
	store_stream: Array<ModelTypes["store"]>
};
	["timestamp"]:any;
	/** Boolean expression to compare columns of type "timestamp". All fields are combined with logical 'AND'. */
["timestamp_comparison_exp"]: {
	_eq?: ModelTypes["timestamp"] | undefined | null,
	_gt?: ModelTypes["timestamp"] | undefined | null,
	_gte?: ModelTypes["timestamp"] | undefined | null,
	_in?: Array<ModelTypes["timestamp"]> | undefined | null,
	_is_null?: boolean | undefined | null,
	_lt?: ModelTypes["timestamp"] | undefined | null,
	_lte?: ModelTypes["timestamp"] | undefined | null,
	_neq?: ModelTypes["timestamp"] | undefined | null,
	_nin?: Array<ModelTypes["timestamp"]> | undefined | null
};
	["tsvector"]:any;
	/** Boolean expression to compare columns of type "tsvector". All fields are combined with logical 'AND'. */
["tsvector_comparison_exp"]: {
	_eq?: ModelTypes["tsvector"] | undefined | null,
	_gt?: ModelTypes["tsvector"] | undefined | null,
	_gte?: ModelTypes["tsvector"] | undefined | null,
	_in?: Array<ModelTypes["tsvector"]> | undefined | null,
	_is_null?: boolean | undefined | null,
	_lt?: ModelTypes["tsvector"] | undefined | null,
	_lte?: ModelTypes["tsvector"] | undefined | null,
	_neq?: ModelTypes["tsvector"] | undefined | null,
	_nin?: Array<ModelTypes["tsvector"]> | undefined | null
}
    }

export type GraphQLTypes = {
    /** Boolean expression to compare columns of type "Boolean". All fields are combined with logical 'AND'. */
["Boolean_comparison_exp"]: {
		_eq?: boolean | undefined | null,
	_gt?: boolean | undefined | null,
	_gte?: boolean | undefined | null,
	_in?: Array<boolean> | undefined | null,
	_is_null?: boolean | undefined | null,
	_lt?: boolean | undefined | null,
	_lte?: boolean | undefined | null,
	_neq?: boolean | undefined | null,
	_nin?: Array<boolean> | undefined | null
};
	/** Boolean expression to compare columns of type "Int". All fields are combined with logical 'AND'. */
["Int_comparison_exp"]: {
		_eq?: number | undefined | null,
	_gt?: number | undefined | null,
	_gte?: number | undefined | null,
	_in?: Array<number> | undefined | null,
	_is_null?: boolean | undefined | null,
	_lt?: number | undefined | null,
	_lte?: number | undefined | null,
	_neq?: number | undefined | null,
	_nin?: Array<number> | undefined | null
};
	/** Boolean expression to compare columns of type "String". All fields are combined with logical 'AND'. */
["String_comparison_exp"]: {
		_eq?: string | undefined | null,
	_gt?: string | undefined | null,
	_gte?: string | undefined | null,
	/** does the column match the given case-insensitive pattern */
	_ilike?: string | undefined | null,
	_in?: Array<string> | undefined | null,
	/** does the column match the given POSIX regular expression, case insensitive */
	_iregex?: string | undefined | null,
	_is_null?: boolean | undefined | null,
	/** does the column match the given pattern */
	_like?: string | undefined | null,
	_lt?: string | undefined | null,
	_lte?: string | undefined | null,
	_neq?: string | undefined | null,
	/** does the column NOT match the given case-insensitive pattern */
	_nilike?: string | undefined | null,
	_nin?: Array<string> | undefined | null,
	/** does the column NOT match the given POSIX regular expression, case insensitive */
	_niregex?: string | undefined | null,
	/** does the column NOT match the given pattern */
	_nlike?: string | undefined | null,
	/** does the column NOT match the given POSIX regular expression, case sensitive */
	_nregex?: string | undefined | null,
	/** does the column NOT match the given SQL regular expression */
	_nsimilar?: string | undefined | null,
	/** does the column match the given POSIX regular expression, case sensitive */
	_regex?: string | undefined | null,
	/** does the column match the given SQL regular expression */
	_similar?: string | undefined | null
};
	["_text"]: "scalar" & { name: "_text" };
	/** Boolean expression to compare columns of type "_text". All fields are combined with logical 'AND'. */
["_text_comparison_exp"]: {
		_eq?: GraphQLTypes["_text"] | undefined | null,
	_gt?: GraphQLTypes["_text"] | undefined | null,
	_gte?: GraphQLTypes["_text"] | undefined | null,
	_in?: Array<GraphQLTypes["_text"]> | undefined | null,
	_is_null?: boolean | undefined | null,
	_lt?: GraphQLTypes["_text"] | undefined | null,
	_lte?: GraphQLTypes["_text"] | undefined | null,
	_neq?: GraphQLTypes["_text"] | undefined | null,
	_nin?: Array<GraphQLTypes["_text"]> | undefined | null
};
	/** columns and relationships of "actor" */
["actor"]: {
	__typename: "actor",
	actor_id: number,
	first_name: string,
	last_name: string,
	last_update: GraphQLTypes["timestamp"]
};
	/** aggregated selection of "actor" */
["actor_aggregate"]: {
	__typename: "actor_aggregate",
	aggregate?: GraphQLTypes["actor_aggregate_fields"] | undefined | null,
	nodes: Array<GraphQLTypes["actor"]>
};
	/** aggregate fields of "actor" */
["actor_aggregate_fields"]: {
	__typename: "actor_aggregate_fields",
	avg?: GraphQLTypes["actor_avg_fields"] | undefined | null,
	count: number,
	max?: GraphQLTypes["actor_max_fields"] | undefined | null,
	min?: GraphQLTypes["actor_min_fields"] | undefined | null,
	stddev?: GraphQLTypes["actor_stddev_fields"] | undefined | null,
	stddev_pop?: GraphQLTypes["actor_stddev_pop_fields"] | undefined | null,
	stddev_samp?: GraphQLTypes["actor_stddev_samp_fields"] | undefined | null,
	sum?: GraphQLTypes["actor_sum_fields"] | undefined | null,
	var_pop?: GraphQLTypes["actor_var_pop_fields"] | undefined | null,
	var_samp?: GraphQLTypes["actor_var_samp_fields"] | undefined | null,
	variance?: GraphQLTypes["actor_variance_fields"] | undefined | null
};
	/** aggregate avg on columns */
["actor_avg_fields"]: {
	__typename: "actor_avg_fields",
	actor_id?: number | undefined | null
};
	/** Boolean expression to filter rows from the table "actor". All fields are combined with a logical 'AND'. */
["actor_bool_exp"]: {
		_and?: Array<GraphQLTypes["actor_bool_exp"]> | undefined | null,
	_not?: GraphQLTypes["actor_bool_exp"] | undefined | null,
	_or?: Array<GraphQLTypes["actor_bool_exp"]> | undefined | null,
	actor_id?: GraphQLTypes["Int_comparison_exp"] | undefined | null,
	first_name?: GraphQLTypes["String_comparison_exp"] | undefined | null,
	last_name?: GraphQLTypes["String_comparison_exp"] | undefined | null,
	last_update?: GraphQLTypes["timestamp_comparison_exp"] | undefined | null
};
	/** unique or primary key constraints on table "actor" */
["actor_constraint"]: actor_constraint;
	/** input type for incrementing numeric columns in table "actor" */
["actor_inc_input"]: {
		actor_id?: number | undefined | null
};
	/** columns and relationships of "actor_info" */
["actor_info"]: {
	__typename: "actor_info",
	actor_id?: number | undefined | null,
	film_info?: string | undefined | null,
	first_name?: string | undefined | null,
	last_name?: string | undefined | null
};
	/** aggregated selection of "actor_info" */
["actor_info_aggregate"]: {
	__typename: "actor_info_aggregate",
	aggregate?: GraphQLTypes["actor_info_aggregate_fields"] | undefined | null,
	nodes: Array<GraphQLTypes["actor_info"]>
};
	/** aggregate fields of "actor_info" */
["actor_info_aggregate_fields"]: {
	__typename: "actor_info_aggregate_fields",
	avg?: GraphQLTypes["actor_info_avg_fields"] | undefined | null,
	count: number,
	max?: GraphQLTypes["actor_info_max_fields"] | undefined | null,
	min?: GraphQLTypes["actor_info_min_fields"] | undefined | null,
	stddev?: GraphQLTypes["actor_info_stddev_fields"] | undefined | null,
	stddev_pop?: GraphQLTypes["actor_info_stddev_pop_fields"] | undefined | null,
	stddev_samp?: GraphQLTypes["actor_info_stddev_samp_fields"] | undefined | null,
	sum?: GraphQLTypes["actor_info_sum_fields"] | undefined | null,
	var_pop?: GraphQLTypes["actor_info_var_pop_fields"] | undefined | null,
	var_samp?: GraphQLTypes["actor_info_var_samp_fields"] | undefined | null,
	variance?: GraphQLTypes["actor_info_variance_fields"] | undefined | null
};
	/** aggregate avg on columns */
["actor_info_avg_fields"]: {
	__typename: "actor_info_avg_fields",
	actor_id?: number | undefined | null
};
	/** Boolean expression to filter rows from the table "actor_info". All fields are combined with a logical 'AND'. */
["actor_info_bool_exp"]: {
		_and?: Array<GraphQLTypes["actor_info_bool_exp"]> | undefined | null,
	_not?: GraphQLTypes["actor_info_bool_exp"] | undefined | null,
	_or?: Array<GraphQLTypes["actor_info_bool_exp"]> | undefined | null,
	actor_id?: GraphQLTypes["Int_comparison_exp"] | undefined | null,
	film_info?: GraphQLTypes["String_comparison_exp"] | undefined | null,
	first_name?: GraphQLTypes["String_comparison_exp"] | undefined | null,
	last_name?: GraphQLTypes["String_comparison_exp"] | undefined | null
};
	/** aggregate max on columns */
["actor_info_max_fields"]: {
	__typename: "actor_info_max_fields",
	actor_id?: number | undefined | null,
	film_info?: string | undefined | null,
	first_name?: string | undefined | null,
	last_name?: string | undefined | null
};
	/** aggregate min on columns */
["actor_info_min_fields"]: {
	__typename: "actor_info_min_fields",
	actor_id?: number | undefined | null,
	film_info?: string | undefined | null,
	first_name?: string | undefined | null,
	last_name?: string | undefined | null
};
	/** Ordering options when selecting data from "actor_info". */
["actor_info_order_by"]: {
		actor_id?: GraphQLTypes["order_by"] | undefined | null,
	film_info?: GraphQLTypes["order_by"] | undefined | null,
	first_name?: GraphQLTypes["order_by"] | undefined | null,
	last_name?: GraphQLTypes["order_by"] | undefined | null
};
	/** select columns of table "actor_info" */
["actor_info_select_column"]: actor_info_select_column;
	/** aggregate stddev on columns */
["actor_info_stddev_fields"]: {
	__typename: "actor_info_stddev_fields",
	actor_id?: number | undefined | null
};
	/** aggregate stddev_pop on columns */
["actor_info_stddev_pop_fields"]: {
	__typename: "actor_info_stddev_pop_fields",
	actor_id?: number | undefined | null
};
	/** aggregate stddev_samp on columns */
["actor_info_stddev_samp_fields"]: {
	__typename: "actor_info_stddev_samp_fields",
	actor_id?: number | undefined | null
};
	/** Streaming cursor of the table "actor_info" */
["actor_info_stream_cursor_input"]: {
		/** Stream column input with initial value */
	initial_value: GraphQLTypes["actor_info_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: GraphQLTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["actor_info_stream_cursor_value_input"]: {
		actor_id?: number | undefined | null,
	film_info?: string | undefined | null,
	first_name?: string | undefined | null,
	last_name?: string | undefined | null
};
	/** aggregate sum on columns */
["actor_info_sum_fields"]: {
	__typename: "actor_info_sum_fields",
	actor_id?: number | undefined | null
};
	/** aggregate var_pop on columns */
["actor_info_var_pop_fields"]: {
	__typename: "actor_info_var_pop_fields",
	actor_id?: number | undefined | null
};
	/** aggregate var_samp on columns */
["actor_info_var_samp_fields"]: {
	__typename: "actor_info_var_samp_fields",
	actor_id?: number | undefined | null
};
	/** aggregate variance on columns */
["actor_info_variance_fields"]: {
	__typename: "actor_info_variance_fields",
	actor_id?: number | undefined | null
};
	/** input type for inserting data into table "actor" */
["actor_insert_input"]: {
		actor_id?: number | undefined | null,
	first_name?: string | undefined | null,
	last_name?: string | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null
};
	/** aggregate max on columns */
["actor_max_fields"]: {
	__typename: "actor_max_fields",
	actor_id?: number | undefined | null,
	first_name?: string | undefined | null,
	last_name?: string | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null
};
	/** aggregate min on columns */
["actor_min_fields"]: {
	__typename: "actor_min_fields",
	actor_id?: number | undefined | null,
	first_name?: string | undefined | null,
	last_name?: string | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null
};
	/** response of any mutation on the table "actor" */
["actor_mutation_response"]: {
	__typename: "actor_mutation_response",
	/** number of rows affected by the mutation */
	affected_rows: number,
	/** data from the rows affected by the mutation */
	returning: Array<GraphQLTypes["actor"]>
};
	/** on_conflict condition type for table "actor" */
["actor_on_conflict"]: {
		constraint: GraphQLTypes["actor_constraint"],
	update_columns: Array<GraphQLTypes["actor_update_column"]>,
	where?: GraphQLTypes["actor_bool_exp"] | undefined | null
};
	/** Ordering options when selecting data from "actor". */
["actor_order_by"]: {
		actor_id?: GraphQLTypes["order_by"] | undefined | null,
	first_name?: GraphQLTypes["order_by"] | undefined | null,
	last_name?: GraphQLTypes["order_by"] | undefined | null,
	last_update?: GraphQLTypes["order_by"] | undefined | null
};
	/** primary key columns input for table: actor */
["actor_pk_columns_input"]: {
		actor_id: number
};
	/** select columns of table "actor" */
["actor_select_column"]: actor_select_column;
	/** input type for updating data in table "actor" */
["actor_set_input"]: {
		actor_id?: number | undefined | null,
	first_name?: string | undefined | null,
	last_name?: string | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null
};
	/** aggregate stddev on columns */
["actor_stddev_fields"]: {
	__typename: "actor_stddev_fields",
	actor_id?: number | undefined | null
};
	/** aggregate stddev_pop on columns */
["actor_stddev_pop_fields"]: {
	__typename: "actor_stddev_pop_fields",
	actor_id?: number | undefined | null
};
	/** aggregate stddev_samp on columns */
["actor_stddev_samp_fields"]: {
	__typename: "actor_stddev_samp_fields",
	actor_id?: number | undefined | null
};
	/** Streaming cursor of the table "actor" */
["actor_stream_cursor_input"]: {
		/** Stream column input with initial value */
	initial_value: GraphQLTypes["actor_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: GraphQLTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["actor_stream_cursor_value_input"]: {
		actor_id?: number | undefined | null,
	first_name?: string | undefined | null,
	last_name?: string | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null
};
	/** aggregate sum on columns */
["actor_sum_fields"]: {
	__typename: "actor_sum_fields",
	actor_id?: number | undefined | null
};
	/** update columns of table "actor" */
["actor_update_column"]: actor_update_column;
	["actor_updates"]: {
		/** increments the numeric columns with given value of the filtered values */
	_inc?: GraphQLTypes["actor_inc_input"] | undefined | null,
	/** sets the columns of the filtered rows to the given values */
	_set?: GraphQLTypes["actor_set_input"] | undefined | null,
	/** filter the rows which have to be updated */
	where: GraphQLTypes["actor_bool_exp"]
};
	/** aggregate var_pop on columns */
["actor_var_pop_fields"]: {
	__typename: "actor_var_pop_fields",
	actor_id?: number | undefined | null
};
	/** aggregate var_samp on columns */
["actor_var_samp_fields"]: {
	__typename: "actor_var_samp_fields",
	actor_id?: number | undefined | null
};
	/** aggregate variance on columns */
["actor_variance_fields"]: {
	__typename: "actor_variance_fields",
	actor_id?: number | undefined | null
};
	/** columns and relationships of "address" */
["address"]: {
	__typename: "address",
	address: string,
	address2?: string | undefined | null,
	address_id: number,
	city_id: GraphQLTypes["smallint"],
	district: string,
	last_update: GraphQLTypes["timestamp"],
	phone: string,
	postal_code?: string | undefined | null
};
	/** aggregated selection of "address" */
["address_aggregate"]: {
	__typename: "address_aggregate",
	aggregate?: GraphQLTypes["address_aggregate_fields"] | undefined | null,
	nodes: Array<GraphQLTypes["address"]>
};
	/** aggregate fields of "address" */
["address_aggregate_fields"]: {
	__typename: "address_aggregate_fields",
	avg?: GraphQLTypes["address_avg_fields"] | undefined | null,
	count: number,
	max?: GraphQLTypes["address_max_fields"] | undefined | null,
	min?: GraphQLTypes["address_min_fields"] | undefined | null,
	stddev?: GraphQLTypes["address_stddev_fields"] | undefined | null,
	stddev_pop?: GraphQLTypes["address_stddev_pop_fields"] | undefined | null,
	stddev_samp?: GraphQLTypes["address_stddev_samp_fields"] | undefined | null,
	sum?: GraphQLTypes["address_sum_fields"] | undefined | null,
	var_pop?: GraphQLTypes["address_var_pop_fields"] | undefined | null,
	var_samp?: GraphQLTypes["address_var_samp_fields"] | undefined | null,
	variance?: GraphQLTypes["address_variance_fields"] | undefined | null
};
	/** aggregate avg on columns */
["address_avg_fields"]: {
	__typename: "address_avg_fields",
	address_id?: number | undefined | null,
	city_id?: number | undefined | null
};
	/** Boolean expression to filter rows from the table "address". All fields are combined with a logical 'AND'. */
["address_bool_exp"]: {
		_and?: Array<GraphQLTypes["address_bool_exp"]> | undefined | null,
	_not?: GraphQLTypes["address_bool_exp"] | undefined | null,
	_or?: Array<GraphQLTypes["address_bool_exp"]> | undefined | null,
	address?: GraphQLTypes["String_comparison_exp"] | undefined | null,
	address2?: GraphQLTypes["String_comparison_exp"] | undefined | null,
	address_id?: GraphQLTypes["Int_comparison_exp"] | undefined | null,
	city_id?: GraphQLTypes["smallint_comparison_exp"] | undefined | null,
	district?: GraphQLTypes["String_comparison_exp"] | undefined | null,
	last_update?: GraphQLTypes["timestamp_comparison_exp"] | undefined | null,
	phone?: GraphQLTypes["String_comparison_exp"] | undefined | null,
	postal_code?: GraphQLTypes["String_comparison_exp"] | undefined | null
};
	/** unique or primary key constraints on table "address" */
["address_constraint"]: address_constraint;
	/** input type for incrementing numeric columns in table "address" */
["address_inc_input"]: {
		address_id?: number | undefined | null,
	city_id?: GraphQLTypes["smallint"] | undefined | null
};
	/** input type for inserting data into table "address" */
["address_insert_input"]: {
		address?: string | undefined | null,
	address2?: string | undefined | null,
	address_id?: number | undefined | null,
	city_id?: GraphQLTypes["smallint"] | undefined | null,
	district?: string | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null,
	phone?: string | undefined | null,
	postal_code?: string | undefined | null
};
	/** aggregate max on columns */
["address_max_fields"]: {
	__typename: "address_max_fields",
	address?: string | undefined | null,
	address2?: string | undefined | null,
	address_id?: number | undefined | null,
	city_id?: GraphQLTypes["smallint"] | undefined | null,
	district?: string | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null,
	phone?: string | undefined | null,
	postal_code?: string | undefined | null
};
	/** aggregate min on columns */
["address_min_fields"]: {
	__typename: "address_min_fields",
	address?: string | undefined | null,
	address2?: string | undefined | null,
	address_id?: number | undefined | null,
	city_id?: GraphQLTypes["smallint"] | undefined | null,
	district?: string | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null,
	phone?: string | undefined | null,
	postal_code?: string | undefined | null
};
	/** response of any mutation on the table "address" */
["address_mutation_response"]: {
	__typename: "address_mutation_response",
	/** number of rows affected by the mutation */
	affected_rows: number,
	/** data from the rows affected by the mutation */
	returning: Array<GraphQLTypes["address"]>
};
	/** on_conflict condition type for table "address" */
["address_on_conflict"]: {
		constraint: GraphQLTypes["address_constraint"],
	update_columns: Array<GraphQLTypes["address_update_column"]>,
	where?: GraphQLTypes["address_bool_exp"] | undefined | null
};
	/** Ordering options when selecting data from "address". */
["address_order_by"]: {
		address?: GraphQLTypes["order_by"] | undefined | null,
	address2?: GraphQLTypes["order_by"] | undefined | null,
	address_id?: GraphQLTypes["order_by"] | undefined | null,
	city_id?: GraphQLTypes["order_by"] | undefined | null,
	district?: GraphQLTypes["order_by"] | undefined | null,
	last_update?: GraphQLTypes["order_by"] | undefined | null,
	phone?: GraphQLTypes["order_by"] | undefined | null,
	postal_code?: GraphQLTypes["order_by"] | undefined | null
};
	/** primary key columns input for table: address */
["address_pk_columns_input"]: {
		address_id: number
};
	/** select columns of table "address" */
["address_select_column"]: address_select_column;
	/** input type for updating data in table "address" */
["address_set_input"]: {
		address?: string | undefined | null,
	address2?: string | undefined | null,
	address_id?: number | undefined | null,
	city_id?: GraphQLTypes["smallint"] | undefined | null,
	district?: string | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null,
	phone?: string | undefined | null,
	postal_code?: string | undefined | null
};
	/** aggregate stddev on columns */
["address_stddev_fields"]: {
	__typename: "address_stddev_fields",
	address_id?: number | undefined | null,
	city_id?: number | undefined | null
};
	/** aggregate stddev_pop on columns */
["address_stddev_pop_fields"]: {
	__typename: "address_stddev_pop_fields",
	address_id?: number | undefined | null,
	city_id?: number | undefined | null
};
	/** aggregate stddev_samp on columns */
["address_stddev_samp_fields"]: {
	__typename: "address_stddev_samp_fields",
	address_id?: number | undefined | null,
	city_id?: number | undefined | null
};
	/** Streaming cursor of the table "address" */
["address_stream_cursor_input"]: {
		/** Stream column input with initial value */
	initial_value: GraphQLTypes["address_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: GraphQLTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["address_stream_cursor_value_input"]: {
		address?: string | undefined | null,
	address2?: string | undefined | null,
	address_id?: number | undefined | null,
	city_id?: GraphQLTypes["smallint"] | undefined | null,
	district?: string | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null,
	phone?: string | undefined | null,
	postal_code?: string | undefined | null
};
	/** aggregate sum on columns */
["address_sum_fields"]: {
	__typename: "address_sum_fields",
	address_id?: number | undefined | null,
	city_id?: GraphQLTypes["smallint"] | undefined | null
};
	/** update columns of table "address" */
["address_update_column"]: address_update_column;
	["address_updates"]: {
		/** increments the numeric columns with given value of the filtered values */
	_inc?: GraphQLTypes["address_inc_input"] | undefined | null,
	/** sets the columns of the filtered rows to the given values */
	_set?: GraphQLTypes["address_set_input"] | undefined | null,
	/** filter the rows which have to be updated */
	where: GraphQLTypes["address_bool_exp"]
};
	/** aggregate var_pop on columns */
["address_var_pop_fields"]: {
	__typename: "address_var_pop_fields",
	address_id?: number | undefined | null,
	city_id?: number | undefined | null
};
	/** aggregate var_samp on columns */
["address_var_samp_fields"]: {
	__typename: "address_var_samp_fields",
	address_id?: number | undefined | null,
	city_id?: number | undefined | null
};
	/** aggregate variance on columns */
["address_variance_fields"]: {
	__typename: "address_variance_fields",
	address_id?: number | undefined | null,
	city_id?: number | undefined | null
};
	["bpchar"]: "scalar" & { name: "bpchar" };
	/** Boolean expression to compare columns of type "bpchar". All fields are combined with logical 'AND'. */
["bpchar_comparison_exp"]: {
		_eq?: GraphQLTypes["bpchar"] | undefined | null,
	_gt?: GraphQLTypes["bpchar"] | undefined | null,
	_gte?: GraphQLTypes["bpchar"] | undefined | null,
	/** does the column match the given case-insensitive pattern */
	_ilike?: GraphQLTypes["bpchar"] | undefined | null,
	_in?: Array<GraphQLTypes["bpchar"]> | undefined | null,
	/** does the column match the given POSIX regular expression, case insensitive */
	_iregex?: GraphQLTypes["bpchar"] | undefined | null,
	_is_null?: boolean | undefined | null,
	/** does the column match the given pattern */
	_like?: GraphQLTypes["bpchar"] | undefined | null,
	_lt?: GraphQLTypes["bpchar"] | undefined | null,
	_lte?: GraphQLTypes["bpchar"] | undefined | null,
	_neq?: GraphQLTypes["bpchar"] | undefined | null,
	/** does the column NOT match the given case-insensitive pattern */
	_nilike?: GraphQLTypes["bpchar"] | undefined | null,
	_nin?: Array<GraphQLTypes["bpchar"]> | undefined | null,
	/** does the column NOT match the given POSIX regular expression, case insensitive */
	_niregex?: GraphQLTypes["bpchar"] | undefined | null,
	/** does the column NOT match the given pattern */
	_nlike?: GraphQLTypes["bpchar"] | undefined | null,
	/** does the column NOT match the given POSIX regular expression, case sensitive */
	_nregex?: GraphQLTypes["bpchar"] | undefined | null,
	/** does the column NOT match the given SQL regular expression */
	_nsimilar?: GraphQLTypes["bpchar"] | undefined | null,
	/** does the column match the given POSIX regular expression, case sensitive */
	_regex?: GraphQLTypes["bpchar"] | undefined | null,
	/** does the column match the given SQL regular expression */
	_similar?: GraphQLTypes["bpchar"] | undefined | null
};
	["bytea"]: "scalar" & { name: "bytea" };
	/** Boolean expression to compare columns of type "bytea". All fields are combined with logical 'AND'. */
["bytea_comparison_exp"]: {
		_eq?: GraphQLTypes["bytea"] | undefined | null,
	_gt?: GraphQLTypes["bytea"] | undefined | null,
	_gte?: GraphQLTypes["bytea"] | undefined | null,
	_in?: Array<GraphQLTypes["bytea"]> | undefined | null,
	_is_null?: boolean | undefined | null,
	_lt?: GraphQLTypes["bytea"] | undefined | null,
	_lte?: GraphQLTypes["bytea"] | undefined | null,
	_neq?: GraphQLTypes["bytea"] | undefined | null,
	_nin?: Array<GraphQLTypes["bytea"]> | undefined | null
};
	/** columns and relationships of "category" */
["category"]: {
	__typename: "category",
	category_id: number,
	last_update: GraphQLTypes["timestamp"],
	name: string
};
	/** aggregated selection of "category" */
["category_aggregate"]: {
	__typename: "category_aggregate",
	aggregate?: GraphQLTypes["category_aggregate_fields"] | undefined | null,
	nodes: Array<GraphQLTypes["category"]>
};
	/** aggregate fields of "category" */
["category_aggregate_fields"]: {
	__typename: "category_aggregate_fields",
	avg?: GraphQLTypes["category_avg_fields"] | undefined | null,
	count: number,
	max?: GraphQLTypes["category_max_fields"] | undefined | null,
	min?: GraphQLTypes["category_min_fields"] | undefined | null,
	stddev?: GraphQLTypes["category_stddev_fields"] | undefined | null,
	stddev_pop?: GraphQLTypes["category_stddev_pop_fields"] | undefined | null,
	stddev_samp?: GraphQLTypes["category_stddev_samp_fields"] | undefined | null,
	sum?: GraphQLTypes["category_sum_fields"] | undefined | null,
	var_pop?: GraphQLTypes["category_var_pop_fields"] | undefined | null,
	var_samp?: GraphQLTypes["category_var_samp_fields"] | undefined | null,
	variance?: GraphQLTypes["category_variance_fields"] | undefined | null
};
	/** aggregate avg on columns */
["category_avg_fields"]: {
	__typename: "category_avg_fields",
	category_id?: number | undefined | null
};
	/** Boolean expression to filter rows from the table "category". All fields are combined with a logical 'AND'. */
["category_bool_exp"]: {
		_and?: Array<GraphQLTypes["category_bool_exp"]> | undefined | null,
	_not?: GraphQLTypes["category_bool_exp"] | undefined | null,
	_or?: Array<GraphQLTypes["category_bool_exp"]> | undefined | null,
	category_id?: GraphQLTypes["Int_comparison_exp"] | undefined | null,
	last_update?: GraphQLTypes["timestamp_comparison_exp"] | undefined | null,
	name?: GraphQLTypes["String_comparison_exp"] | undefined | null
};
	/** unique or primary key constraints on table "category" */
["category_constraint"]: category_constraint;
	/** input type for incrementing numeric columns in table "category" */
["category_inc_input"]: {
		category_id?: number | undefined | null
};
	/** input type for inserting data into table "category" */
["category_insert_input"]: {
		category_id?: number | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null,
	name?: string | undefined | null
};
	/** aggregate max on columns */
["category_max_fields"]: {
	__typename: "category_max_fields",
	category_id?: number | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null,
	name?: string | undefined | null
};
	/** aggregate min on columns */
["category_min_fields"]: {
	__typename: "category_min_fields",
	category_id?: number | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null,
	name?: string | undefined | null
};
	/** response of any mutation on the table "category" */
["category_mutation_response"]: {
	__typename: "category_mutation_response",
	/** number of rows affected by the mutation */
	affected_rows: number,
	/** data from the rows affected by the mutation */
	returning: Array<GraphQLTypes["category"]>
};
	/** on_conflict condition type for table "category" */
["category_on_conflict"]: {
		constraint: GraphQLTypes["category_constraint"],
	update_columns: Array<GraphQLTypes["category_update_column"]>,
	where?: GraphQLTypes["category_bool_exp"] | undefined | null
};
	/** Ordering options when selecting data from "category". */
["category_order_by"]: {
		category_id?: GraphQLTypes["order_by"] | undefined | null,
	last_update?: GraphQLTypes["order_by"] | undefined | null,
	name?: GraphQLTypes["order_by"] | undefined | null
};
	/** primary key columns input for table: category */
["category_pk_columns_input"]: {
		category_id: number
};
	/** select columns of table "category" */
["category_select_column"]: category_select_column;
	/** input type for updating data in table "category" */
["category_set_input"]: {
		category_id?: number | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null,
	name?: string | undefined | null
};
	/** aggregate stddev on columns */
["category_stddev_fields"]: {
	__typename: "category_stddev_fields",
	category_id?: number | undefined | null
};
	/** aggregate stddev_pop on columns */
["category_stddev_pop_fields"]: {
	__typename: "category_stddev_pop_fields",
	category_id?: number | undefined | null
};
	/** aggregate stddev_samp on columns */
["category_stddev_samp_fields"]: {
	__typename: "category_stddev_samp_fields",
	category_id?: number | undefined | null
};
	/** Streaming cursor of the table "category" */
["category_stream_cursor_input"]: {
		/** Stream column input with initial value */
	initial_value: GraphQLTypes["category_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: GraphQLTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["category_stream_cursor_value_input"]: {
		category_id?: number | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null,
	name?: string | undefined | null
};
	/** aggregate sum on columns */
["category_sum_fields"]: {
	__typename: "category_sum_fields",
	category_id?: number | undefined | null
};
	/** update columns of table "category" */
["category_update_column"]: category_update_column;
	["category_updates"]: {
		/** increments the numeric columns with given value of the filtered values */
	_inc?: GraphQLTypes["category_inc_input"] | undefined | null,
	/** sets the columns of the filtered rows to the given values */
	_set?: GraphQLTypes["category_set_input"] | undefined | null,
	/** filter the rows which have to be updated */
	where: GraphQLTypes["category_bool_exp"]
};
	/** aggregate var_pop on columns */
["category_var_pop_fields"]: {
	__typename: "category_var_pop_fields",
	category_id?: number | undefined | null
};
	/** aggregate var_samp on columns */
["category_var_samp_fields"]: {
	__typename: "category_var_samp_fields",
	category_id?: number | undefined | null
};
	/** aggregate variance on columns */
["category_variance_fields"]: {
	__typename: "category_variance_fields",
	category_id?: number | undefined | null
};
	/** columns and relationships of "city" */
["city"]: {
	__typename: "city",
	city: string,
	city_id: number,
	country_id: GraphQLTypes["smallint"],
	last_update: GraphQLTypes["timestamp"]
};
	/** aggregated selection of "city" */
["city_aggregate"]: {
	__typename: "city_aggregate",
	aggregate?: GraphQLTypes["city_aggregate_fields"] | undefined | null,
	nodes: Array<GraphQLTypes["city"]>
};
	/** aggregate fields of "city" */
["city_aggregate_fields"]: {
	__typename: "city_aggregate_fields",
	avg?: GraphQLTypes["city_avg_fields"] | undefined | null,
	count: number,
	max?: GraphQLTypes["city_max_fields"] | undefined | null,
	min?: GraphQLTypes["city_min_fields"] | undefined | null,
	stddev?: GraphQLTypes["city_stddev_fields"] | undefined | null,
	stddev_pop?: GraphQLTypes["city_stddev_pop_fields"] | undefined | null,
	stddev_samp?: GraphQLTypes["city_stddev_samp_fields"] | undefined | null,
	sum?: GraphQLTypes["city_sum_fields"] | undefined | null,
	var_pop?: GraphQLTypes["city_var_pop_fields"] | undefined | null,
	var_samp?: GraphQLTypes["city_var_samp_fields"] | undefined | null,
	variance?: GraphQLTypes["city_variance_fields"] | undefined | null
};
	/** aggregate avg on columns */
["city_avg_fields"]: {
	__typename: "city_avg_fields",
	city_id?: number | undefined | null,
	country_id?: number | undefined | null
};
	/** Boolean expression to filter rows from the table "city". All fields are combined with a logical 'AND'. */
["city_bool_exp"]: {
		_and?: Array<GraphQLTypes["city_bool_exp"]> | undefined | null,
	_not?: GraphQLTypes["city_bool_exp"] | undefined | null,
	_or?: Array<GraphQLTypes["city_bool_exp"]> | undefined | null,
	city?: GraphQLTypes["String_comparison_exp"] | undefined | null,
	city_id?: GraphQLTypes["Int_comparison_exp"] | undefined | null,
	country_id?: GraphQLTypes["smallint_comparison_exp"] | undefined | null,
	last_update?: GraphQLTypes["timestamp_comparison_exp"] | undefined | null
};
	/** unique or primary key constraints on table "city" */
["city_constraint"]: city_constraint;
	/** input type for incrementing numeric columns in table "city" */
["city_inc_input"]: {
		city_id?: number | undefined | null,
	country_id?: GraphQLTypes["smallint"] | undefined | null
};
	/** input type for inserting data into table "city" */
["city_insert_input"]: {
		city?: string | undefined | null,
	city_id?: number | undefined | null,
	country_id?: GraphQLTypes["smallint"] | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null
};
	/** aggregate max on columns */
["city_max_fields"]: {
	__typename: "city_max_fields",
	city?: string | undefined | null,
	city_id?: number | undefined | null,
	country_id?: GraphQLTypes["smallint"] | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null
};
	/** aggregate min on columns */
["city_min_fields"]: {
	__typename: "city_min_fields",
	city?: string | undefined | null,
	city_id?: number | undefined | null,
	country_id?: GraphQLTypes["smallint"] | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null
};
	/** response of any mutation on the table "city" */
["city_mutation_response"]: {
	__typename: "city_mutation_response",
	/** number of rows affected by the mutation */
	affected_rows: number,
	/** data from the rows affected by the mutation */
	returning: Array<GraphQLTypes["city"]>
};
	/** on_conflict condition type for table "city" */
["city_on_conflict"]: {
		constraint: GraphQLTypes["city_constraint"],
	update_columns: Array<GraphQLTypes["city_update_column"]>,
	where?: GraphQLTypes["city_bool_exp"] | undefined | null
};
	/** Ordering options when selecting data from "city". */
["city_order_by"]: {
		city?: GraphQLTypes["order_by"] | undefined | null,
	city_id?: GraphQLTypes["order_by"] | undefined | null,
	country_id?: GraphQLTypes["order_by"] | undefined | null,
	last_update?: GraphQLTypes["order_by"] | undefined | null
};
	/** primary key columns input for table: city */
["city_pk_columns_input"]: {
		city_id: number
};
	/** select columns of table "city" */
["city_select_column"]: city_select_column;
	/** input type for updating data in table "city" */
["city_set_input"]: {
		city?: string | undefined | null,
	city_id?: number | undefined | null,
	country_id?: GraphQLTypes["smallint"] | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null
};
	/** aggregate stddev on columns */
["city_stddev_fields"]: {
	__typename: "city_stddev_fields",
	city_id?: number | undefined | null,
	country_id?: number | undefined | null
};
	/** aggregate stddev_pop on columns */
["city_stddev_pop_fields"]: {
	__typename: "city_stddev_pop_fields",
	city_id?: number | undefined | null,
	country_id?: number | undefined | null
};
	/** aggregate stddev_samp on columns */
["city_stddev_samp_fields"]: {
	__typename: "city_stddev_samp_fields",
	city_id?: number | undefined | null,
	country_id?: number | undefined | null
};
	/** Streaming cursor of the table "city" */
["city_stream_cursor_input"]: {
		/** Stream column input with initial value */
	initial_value: GraphQLTypes["city_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: GraphQLTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["city_stream_cursor_value_input"]: {
		city?: string | undefined | null,
	city_id?: number | undefined | null,
	country_id?: GraphQLTypes["smallint"] | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null
};
	/** aggregate sum on columns */
["city_sum_fields"]: {
	__typename: "city_sum_fields",
	city_id?: number | undefined | null,
	country_id?: GraphQLTypes["smallint"] | undefined | null
};
	/** update columns of table "city" */
["city_update_column"]: city_update_column;
	["city_updates"]: {
		/** increments the numeric columns with given value of the filtered values */
	_inc?: GraphQLTypes["city_inc_input"] | undefined | null,
	/** sets the columns of the filtered rows to the given values */
	_set?: GraphQLTypes["city_set_input"] | undefined | null,
	/** filter the rows which have to be updated */
	where: GraphQLTypes["city_bool_exp"]
};
	/** aggregate var_pop on columns */
["city_var_pop_fields"]: {
	__typename: "city_var_pop_fields",
	city_id?: number | undefined | null,
	country_id?: number | undefined | null
};
	/** aggregate var_samp on columns */
["city_var_samp_fields"]: {
	__typename: "city_var_samp_fields",
	city_id?: number | undefined | null,
	country_id?: number | undefined | null
};
	/** aggregate variance on columns */
["city_variance_fields"]: {
	__typename: "city_variance_fields",
	city_id?: number | undefined | null,
	country_id?: number | undefined | null
};
	/** columns and relationships of "country" */
["country"]: {
	__typename: "country",
	country: string,
	country_id: number,
	last_update: GraphQLTypes["timestamp"]
};
	/** aggregated selection of "country" */
["country_aggregate"]: {
	__typename: "country_aggregate",
	aggregate?: GraphQLTypes["country_aggregate_fields"] | undefined | null,
	nodes: Array<GraphQLTypes["country"]>
};
	/** aggregate fields of "country" */
["country_aggregate_fields"]: {
	__typename: "country_aggregate_fields",
	avg?: GraphQLTypes["country_avg_fields"] | undefined | null,
	count: number,
	max?: GraphQLTypes["country_max_fields"] | undefined | null,
	min?: GraphQLTypes["country_min_fields"] | undefined | null,
	stddev?: GraphQLTypes["country_stddev_fields"] | undefined | null,
	stddev_pop?: GraphQLTypes["country_stddev_pop_fields"] | undefined | null,
	stddev_samp?: GraphQLTypes["country_stddev_samp_fields"] | undefined | null,
	sum?: GraphQLTypes["country_sum_fields"] | undefined | null,
	var_pop?: GraphQLTypes["country_var_pop_fields"] | undefined | null,
	var_samp?: GraphQLTypes["country_var_samp_fields"] | undefined | null,
	variance?: GraphQLTypes["country_variance_fields"] | undefined | null
};
	/** aggregate avg on columns */
["country_avg_fields"]: {
	__typename: "country_avg_fields",
	country_id?: number | undefined | null
};
	/** Boolean expression to filter rows from the table "country". All fields are combined with a logical 'AND'. */
["country_bool_exp"]: {
		_and?: Array<GraphQLTypes["country_bool_exp"]> | undefined | null,
	_not?: GraphQLTypes["country_bool_exp"] | undefined | null,
	_or?: Array<GraphQLTypes["country_bool_exp"]> | undefined | null,
	country?: GraphQLTypes["String_comparison_exp"] | undefined | null,
	country_id?: GraphQLTypes["Int_comparison_exp"] | undefined | null,
	last_update?: GraphQLTypes["timestamp_comparison_exp"] | undefined | null
};
	/** unique or primary key constraints on table "country" */
["country_constraint"]: country_constraint;
	/** input type for incrementing numeric columns in table "country" */
["country_inc_input"]: {
		country_id?: number | undefined | null
};
	/** input type for inserting data into table "country" */
["country_insert_input"]: {
		country?: string | undefined | null,
	country_id?: number | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null
};
	/** aggregate max on columns */
["country_max_fields"]: {
	__typename: "country_max_fields",
	country?: string | undefined | null,
	country_id?: number | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null
};
	/** aggregate min on columns */
["country_min_fields"]: {
	__typename: "country_min_fields",
	country?: string | undefined | null,
	country_id?: number | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null
};
	/** response of any mutation on the table "country" */
["country_mutation_response"]: {
	__typename: "country_mutation_response",
	/** number of rows affected by the mutation */
	affected_rows: number,
	/** data from the rows affected by the mutation */
	returning: Array<GraphQLTypes["country"]>
};
	/** on_conflict condition type for table "country" */
["country_on_conflict"]: {
		constraint: GraphQLTypes["country_constraint"],
	update_columns: Array<GraphQLTypes["country_update_column"]>,
	where?: GraphQLTypes["country_bool_exp"] | undefined | null
};
	/** Ordering options when selecting data from "country". */
["country_order_by"]: {
		country?: GraphQLTypes["order_by"] | undefined | null,
	country_id?: GraphQLTypes["order_by"] | undefined | null,
	last_update?: GraphQLTypes["order_by"] | undefined | null
};
	/** primary key columns input for table: country */
["country_pk_columns_input"]: {
		country_id: number
};
	/** select columns of table "country" */
["country_select_column"]: country_select_column;
	/** input type for updating data in table "country" */
["country_set_input"]: {
		country?: string | undefined | null,
	country_id?: number | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null
};
	/** aggregate stddev on columns */
["country_stddev_fields"]: {
	__typename: "country_stddev_fields",
	country_id?: number | undefined | null
};
	/** aggregate stddev_pop on columns */
["country_stddev_pop_fields"]: {
	__typename: "country_stddev_pop_fields",
	country_id?: number | undefined | null
};
	/** aggregate stddev_samp on columns */
["country_stddev_samp_fields"]: {
	__typename: "country_stddev_samp_fields",
	country_id?: number | undefined | null
};
	/** Streaming cursor of the table "country" */
["country_stream_cursor_input"]: {
		/** Stream column input with initial value */
	initial_value: GraphQLTypes["country_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: GraphQLTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["country_stream_cursor_value_input"]: {
		country?: string | undefined | null,
	country_id?: number | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null
};
	/** aggregate sum on columns */
["country_sum_fields"]: {
	__typename: "country_sum_fields",
	country_id?: number | undefined | null
};
	/** update columns of table "country" */
["country_update_column"]: country_update_column;
	["country_updates"]: {
		/** increments the numeric columns with given value of the filtered values */
	_inc?: GraphQLTypes["country_inc_input"] | undefined | null,
	/** sets the columns of the filtered rows to the given values */
	_set?: GraphQLTypes["country_set_input"] | undefined | null,
	/** filter the rows which have to be updated */
	where: GraphQLTypes["country_bool_exp"]
};
	/** aggregate var_pop on columns */
["country_var_pop_fields"]: {
	__typename: "country_var_pop_fields",
	country_id?: number | undefined | null
};
	/** aggregate var_samp on columns */
["country_var_samp_fields"]: {
	__typename: "country_var_samp_fields",
	country_id?: number | undefined | null
};
	/** aggregate variance on columns */
["country_variance_fields"]: {
	__typename: "country_variance_fields",
	country_id?: number | undefined | null
};
	/** ordering argument of a cursor */
["cursor_ordering"]: cursor_ordering;
	/** columns and relationships of "customer" */
["customer"]: {
	__typename: "customer",
	active?: number | undefined | null,
	activebool: boolean,
	address_id: GraphQLTypes["smallint"],
	create_date: GraphQLTypes["date"],
	customer_id: number,
	email?: string | undefined | null,
	first_name: string,
	last_name: string,
	last_update?: GraphQLTypes["timestamp"] | undefined | null,
	store_id: GraphQLTypes["smallint"]
};
	/** aggregated selection of "customer" */
["customer_aggregate"]: {
	__typename: "customer_aggregate",
	aggregate?: GraphQLTypes["customer_aggregate_fields"] | undefined | null,
	nodes: Array<GraphQLTypes["customer"]>
};
	/** aggregate fields of "customer" */
["customer_aggregate_fields"]: {
	__typename: "customer_aggregate_fields",
	avg?: GraphQLTypes["customer_avg_fields"] | undefined | null,
	count: number,
	max?: GraphQLTypes["customer_max_fields"] | undefined | null,
	min?: GraphQLTypes["customer_min_fields"] | undefined | null,
	stddev?: GraphQLTypes["customer_stddev_fields"] | undefined | null,
	stddev_pop?: GraphQLTypes["customer_stddev_pop_fields"] | undefined | null,
	stddev_samp?: GraphQLTypes["customer_stddev_samp_fields"] | undefined | null,
	sum?: GraphQLTypes["customer_sum_fields"] | undefined | null,
	var_pop?: GraphQLTypes["customer_var_pop_fields"] | undefined | null,
	var_samp?: GraphQLTypes["customer_var_samp_fields"] | undefined | null,
	variance?: GraphQLTypes["customer_variance_fields"] | undefined | null
};
	/** aggregate avg on columns */
["customer_avg_fields"]: {
	__typename: "customer_avg_fields",
	active?: number | undefined | null,
	address_id?: number | undefined | null,
	customer_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	/** Boolean expression to filter rows from the table "customer". All fields are combined with a logical 'AND'. */
["customer_bool_exp"]: {
		_and?: Array<GraphQLTypes["customer_bool_exp"]> | undefined | null,
	_not?: GraphQLTypes["customer_bool_exp"] | undefined | null,
	_or?: Array<GraphQLTypes["customer_bool_exp"]> | undefined | null,
	active?: GraphQLTypes["Int_comparison_exp"] | undefined | null,
	activebool?: GraphQLTypes["Boolean_comparison_exp"] | undefined | null,
	address_id?: GraphQLTypes["smallint_comparison_exp"] | undefined | null,
	create_date?: GraphQLTypes["date_comparison_exp"] | undefined | null,
	customer_id?: GraphQLTypes["Int_comparison_exp"] | undefined | null,
	email?: GraphQLTypes["String_comparison_exp"] | undefined | null,
	first_name?: GraphQLTypes["String_comparison_exp"] | undefined | null,
	last_name?: GraphQLTypes["String_comparison_exp"] | undefined | null,
	last_update?: GraphQLTypes["timestamp_comparison_exp"] | undefined | null,
	store_id?: GraphQLTypes["smallint_comparison_exp"] | undefined | null
};
	/** unique or primary key constraints on table "customer" */
["customer_constraint"]: customer_constraint;
	/** input type for incrementing numeric columns in table "customer" */
["customer_inc_input"]: {
		active?: number | undefined | null,
	address_id?: GraphQLTypes["smallint"] | undefined | null,
	customer_id?: number | undefined | null,
	store_id?: GraphQLTypes["smallint"] | undefined | null
};
	/** input type for inserting data into table "customer" */
["customer_insert_input"]: {
		active?: number | undefined | null,
	activebool?: boolean | undefined | null,
	address_id?: GraphQLTypes["smallint"] | undefined | null,
	create_date?: GraphQLTypes["date"] | undefined | null,
	customer_id?: number | undefined | null,
	email?: string | undefined | null,
	first_name?: string | undefined | null,
	last_name?: string | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null,
	store_id?: GraphQLTypes["smallint"] | undefined | null
};
	/** columns and relationships of "customer_list" */
["customer_list"]: {
	__typename: "customer_list",
	address?: string | undefined | null,
	city?: string | undefined | null,
	country?: string | undefined | null,
	id?: number | undefined | null,
	name?: string | undefined | null,
	notes?: string | undefined | null,
	phone?: string | undefined | null,
	sid?: GraphQLTypes["smallint"] | undefined | null,
	zip_code?: string | undefined | null
};
	/** aggregated selection of "customer_list" */
["customer_list_aggregate"]: {
	__typename: "customer_list_aggregate",
	aggregate?: GraphQLTypes["customer_list_aggregate_fields"] | undefined | null,
	nodes: Array<GraphQLTypes["customer_list"]>
};
	/** aggregate fields of "customer_list" */
["customer_list_aggregate_fields"]: {
	__typename: "customer_list_aggregate_fields",
	avg?: GraphQLTypes["customer_list_avg_fields"] | undefined | null,
	count: number,
	max?: GraphQLTypes["customer_list_max_fields"] | undefined | null,
	min?: GraphQLTypes["customer_list_min_fields"] | undefined | null,
	stddev?: GraphQLTypes["customer_list_stddev_fields"] | undefined | null,
	stddev_pop?: GraphQLTypes["customer_list_stddev_pop_fields"] | undefined | null,
	stddev_samp?: GraphQLTypes["customer_list_stddev_samp_fields"] | undefined | null,
	sum?: GraphQLTypes["customer_list_sum_fields"] | undefined | null,
	var_pop?: GraphQLTypes["customer_list_var_pop_fields"] | undefined | null,
	var_samp?: GraphQLTypes["customer_list_var_samp_fields"] | undefined | null,
	variance?: GraphQLTypes["customer_list_variance_fields"] | undefined | null
};
	/** aggregate avg on columns */
["customer_list_avg_fields"]: {
	__typename: "customer_list_avg_fields",
	id?: number | undefined | null,
	sid?: number | undefined | null
};
	/** Boolean expression to filter rows from the table "customer_list". All fields are combined with a logical 'AND'. */
["customer_list_bool_exp"]: {
		_and?: Array<GraphQLTypes["customer_list_bool_exp"]> | undefined | null,
	_not?: GraphQLTypes["customer_list_bool_exp"] | undefined | null,
	_or?: Array<GraphQLTypes["customer_list_bool_exp"]> | undefined | null,
	address?: GraphQLTypes["String_comparison_exp"] | undefined | null,
	city?: GraphQLTypes["String_comparison_exp"] | undefined | null,
	country?: GraphQLTypes["String_comparison_exp"] | undefined | null,
	id?: GraphQLTypes["Int_comparison_exp"] | undefined | null,
	name?: GraphQLTypes["String_comparison_exp"] | undefined | null,
	notes?: GraphQLTypes["String_comparison_exp"] | undefined | null,
	phone?: GraphQLTypes["String_comparison_exp"] | undefined | null,
	sid?: GraphQLTypes["smallint_comparison_exp"] | undefined | null,
	zip_code?: GraphQLTypes["String_comparison_exp"] | undefined | null
};
	/** aggregate max on columns */
["customer_list_max_fields"]: {
	__typename: "customer_list_max_fields",
	address?: string | undefined | null,
	city?: string | undefined | null,
	country?: string | undefined | null,
	id?: number | undefined | null,
	name?: string | undefined | null,
	notes?: string | undefined | null,
	phone?: string | undefined | null,
	sid?: GraphQLTypes["smallint"] | undefined | null,
	zip_code?: string | undefined | null
};
	/** aggregate min on columns */
["customer_list_min_fields"]: {
	__typename: "customer_list_min_fields",
	address?: string | undefined | null,
	city?: string | undefined | null,
	country?: string | undefined | null,
	id?: number | undefined | null,
	name?: string | undefined | null,
	notes?: string | undefined | null,
	phone?: string | undefined | null,
	sid?: GraphQLTypes["smallint"] | undefined | null,
	zip_code?: string | undefined | null
};
	/** Ordering options when selecting data from "customer_list". */
["customer_list_order_by"]: {
		address?: GraphQLTypes["order_by"] | undefined | null,
	city?: GraphQLTypes["order_by"] | undefined | null,
	country?: GraphQLTypes["order_by"] | undefined | null,
	id?: GraphQLTypes["order_by"] | undefined | null,
	name?: GraphQLTypes["order_by"] | undefined | null,
	notes?: GraphQLTypes["order_by"] | undefined | null,
	phone?: GraphQLTypes["order_by"] | undefined | null,
	sid?: GraphQLTypes["order_by"] | undefined | null,
	zip_code?: GraphQLTypes["order_by"] | undefined | null
};
	/** select columns of table "customer_list" */
["customer_list_select_column"]: customer_list_select_column;
	/** aggregate stddev on columns */
["customer_list_stddev_fields"]: {
	__typename: "customer_list_stddev_fields",
	id?: number | undefined | null,
	sid?: number | undefined | null
};
	/** aggregate stddev_pop on columns */
["customer_list_stddev_pop_fields"]: {
	__typename: "customer_list_stddev_pop_fields",
	id?: number | undefined | null,
	sid?: number | undefined | null
};
	/** aggregate stddev_samp on columns */
["customer_list_stddev_samp_fields"]: {
	__typename: "customer_list_stddev_samp_fields",
	id?: number | undefined | null,
	sid?: number | undefined | null
};
	/** Streaming cursor of the table "customer_list" */
["customer_list_stream_cursor_input"]: {
		/** Stream column input with initial value */
	initial_value: GraphQLTypes["customer_list_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: GraphQLTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["customer_list_stream_cursor_value_input"]: {
		address?: string | undefined | null,
	city?: string | undefined | null,
	country?: string | undefined | null,
	id?: number | undefined | null,
	name?: string | undefined | null,
	notes?: string | undefined | null,
	phone?: string | undefined | null,
	sid?: GraphQLTypes["smallint"] | undefined | null,
	zip_code?: string | undefined | null
};
	/** aggregate sum on columns */
["customer_list_sum_fields"]: {
	__typename: "customer_list_sum_fields",
	id?: number | undefined | null,
	sid?: GraphQLTypes["smallint"] | undefined | null
};
	/** aggregate var_pop on columns */
["customer_list_var_pop_fields"]: {
	__typename: "customer_list_var_pop_fields",
	id?: number | undefined | null,
	sid?: number | undefined | null
};
	/** aggregate var_samp on columns */
["customer_list_var_samp_fields"]: {
	__typename: "customer_list_var_samp_fields",
	id?: number | undefined | null,
	sid?: number | undefined | null
};
	/** aggregate variance on columns */
["customer_list_variance_fields"]: {
	__typename: "customer_list_variance_fields",
	id?: number | undefined | null,
	sid?: number | undefined | null
};
	/** aggregate max on columns */
["customer_max_fields"]: {
	__typename: "customer_max_fields",
	active?: number | undefined | null,
	address_id?: GraphQLTypes["smallint"] | undefined | null,
	create_date?: GraphQLTypes["date"] | undefined | null,
	customer_id?: number | undefined | null,
	email?: string | undefined | null,
	first_name?: string | undefined | null,
	last_name?: string | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null,
	store_id?: GraphQLTypes["smallint"] | undefined | null
};
	/** aggregate min on columns */
["customer_min_fields"]: {
	__typename: "customer_min_fields",
	active?: number | undefined | null,
	address_id?: GraphQLTypes["smallint"] | undefined | null,
	create_date?: GraphQLTypes["date"] | undefined | null,
	customer_id?: number | undefined | null,
	email?: string | undefined | null,
	first_name?: string | undefined | null,
	last_name?: string | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null,
	store_id?: GraphQLTypes["smallint"] | undefined | null
};
	/** response of any mutation on the table "customer" */
["customer_mutation_response"]: {
	__typename: "customer_mutation_response",
	/** number of rows affected by the mutation */
	affected_rows: number,
	/** data from the rows affected by the mutation */
	returning: Array<GraphQLTypes["customer"]>
};
	/** on_conflict condition type for table "customer" */
["customer_on_conflict"]: {
		constraint: GraphQLTypes["customer_constraint"],
	update_columns: Array<GraphQLTypes["customer_update_column"]>,
	where?: GraphQLTypes["customer_bool_exp"] | undefined | null
};
	/** Ordering options when selecting data from "customer". */
["customer_order_by"]: {
		active?: GraphQLTypes["order_by"] | undefined | null,
	activebool?: GraphQLTypes["order_by"] | undefined | null,
	address_id?: GraphQLTypes["order_by"] | undefined | null,
	create_date?: GraphQLTypes["order_by"] | undefined | null,
	customer_id?: GraphQLTypes["order_by"] | undefined | null,
	email?: GraphQLTypes["order_by"] | undefined | null,
	first_name?: GraphQLTypes["order_by"] | undefined | null,
	last_name?: GraphQLTypes["order_by"] | undefined | null,
	last_update?: GraphQLTypes["order_by"] | undefined | null,
	store_id?: GraphQLTypes["order_by"] | undefined | null
};
	/** primary key columns input for table: customer */
["customer_pk_columns_input"]: {
		customer_id: number
};
	/** select columns of table "customer" */
["customer_select_column"]: customer_select_column;
	/** input type for updating data in table "customer" */
["customer_set_input"]: {
		active?: number | undefined | null,
	activebool?: boolean | undefined | null,
	address_id?: GraphQLTypes["smallint"] | undefined | null,
	create_date?: GraphQLTypes["date"] | undefined | null,
	customer_id?: number | undefined | null,
	email?: string | undefined | null,
	first_name?: string | undefined | null,
	last_name?: string | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null,
	store_id?: GraphQLTypes["smallint"] | undefined | null
};
	/** aggregate stddev on columns */
["customer_stddev_fields"]: {
	__typename: "customer_stddev_fields",
	active?: number | undefined | null,
	address_id?: number | undefined | null,
	customer_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	/** aggregate stddev_pop on columns */
["customer_stddev_pop_fields"]: {
	__typename: "customer_stddev_pop_fields",
	active?: number | undefined | null,
	address_id?: number | undefined | null,
	customer_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	/** aggregate stddev_samp on columns */
["customer_stddev_samp_fields"]: {
	__typename: "customer_stddev_samp_fields",
	active?: number | undefined | null,
	address_id?: number | undefined | null,
	customer_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	/** Streaming cursor of the table "customer" */
["customer_stream_cursor_input"]: {
		/** Stream column input with initial value */
	initial_value: GraphQLTypes["customer_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: GraphQLTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["customer_stream_cursor_value_input"]: {
		active?: number | undefined | null,
	activebool?: boolean | undefined | null,
	address_id?: GraphQLTypes["smallint"] | undefined | null,
	create_date?: GraphQLTypes["date"] | undefined | null,
	customer_id?: number | undefined | null,
	email?: string | undefined | null,
	first_name?: string | undefined | null,
	last_name?: string | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null,
	store_id?: GraphQLTypes["smallint"] | undefined | null
};
	/** aggregate sum on columns */
["customer_sum_fields"]: {
	__typename: "customer_sum_fields",
	active?: number | undefined | null,
	address_id?: GraphQLTypes["smallint"] | undefined | null,
	customer_id?: number | undefined | null,
	store_id?: GraphQLTypes["smallint"] | undefined | null
};
	/** update columns of table "customer" */
["customer_update_column"]: customer_update_column;
	["customer_updates"]: {
		/** increments the numeric columns with given value of the filtered values */
	_inc?: GraphQLTypes["customer_inc_input"] | undefined | null,
	/** sets the columns of the filtered rows to the given values */
	_set?: GraphQLTypes["customer_set_input"] | undefined | null,
	/** filter the rows which have to be updated */
	where: GraphQLTypes["customer_bool_exp"]
};
	/** aggregate var_pop on columns */
["customer_var_pop_fields"]: {
	__typename: "customer_var_pop_fields",
	active?: number | undefined | null,
	address_id?: number | undefined | null,
	customer_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	/** aggregate var_samp on columns */
["customer_var_samp_fields"]: {
	__typename: "customer_var_samp_fields",
	active?: number | undefined | null,
	address_id?: number | undefined | null,
	customer_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	/** aggregate variance on columns */
["customer_variance_fields"]: {
	__typename: "customer_variance_fields",
	active?: number | undefined | null,
	address_id?: number | undefined | null,
	customer_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	["date"]: "scalar" & { name: "date" };
	/** Boolean expression to compare columns of type "date". All fields are combined with logical 'AND'. */
["date_comparison_exp"]: {
		_eq?: GraphQLTypes["date"] | undefined | null,
	_gt?: GraphQLTypes["date"] | undefined | null,
	_gte?: GraphQLTypes["date"] | undefined | null,
	_in?: Array<GraphQLTypes["date"]> | undefined | null,
	_is_null?: boolean | undefined | null,
	_lt?: GraphQLTypes["date"] | undefined | null,
	_lte?: GraphQLTypes["date"] | undefined | null,
	_neq?: GraphQLTypes["date"] | undefined | null,
	_nin?: Array<GraphQLTypes["date"]> | undefined | null
};
	/** columns and relationships of "film" */
["film"]: {
	__typename: "film",
	description?: string | undefined | null,
	film_id: number,
	fulltext: GraphQLTypes["tsvector"],
	language_id: GraphQLTypes["smallint"],
	last_update: GraphQLTypes["timestamp"],
	length?: GraphQLTypes["smallint"] | undefined | null,
	rating?: GraphQLTypes["mpaa_rating"] | undefined | null,
	release_year?: number | undefined | null,
	rental_duration: GraphQLTypes["smallint"],
	rental_rate: GraphQLTypes["numeric"],
	replacement_cost: GraphQLTypes["numeric"],
	special_features?: GraphQLTypes["_text"] | undefined | null,
	title: string
};
	/** columns and relationships of "film_actor" */
["film_actor"]: {
	__typename: "film_actor",
	actor_id: GraphQLTypes["smallint"],
	film_id: GraphQLTypes["smallint"],
	last_update: GraphQLTypes["timestamp"]
};
	/** aggregated selection of "film_actor" */
["film_actor_aggregate"]: {
	__typename: "film_actor_aggregate",
	aggregate?: GraphQLTypes["film_actor_aggregate_fields"] | undefined | null,
	nodes: Array<GraphQLTypes["film_actor"]>
};
	/** aggregate fields of "film_actor" */
["film_actor_aggregate_fields"]: {
	__typename: "film_actor_aggregate_fields",
	avg?: GraphQLTypes["film_actor_avg_fields"] | undefined | null,
	count: number,
	max?: GraphQLTypes["film_actor_max_fields"] | undefined | null,
	min?: GraphQLTypes["film_actor_min_fields"] | undefined | null,
	stddev?: GraphQLTypes["film_actor_stddev_fields"] | undefined | null,
	stddev_pop?: GraphQLTypes["film_actor_stddev_pop_fields"] | undefined | null,
	stddev_samp?: GraphQLTypes["film_actor_stddev_samp_fields"] | undefined | null,
	sum?: GraphQLTypes["film_actor_sum_fields"] | undefined | null,
	var_pop?: GraphQLTypes["film_actor_var_pop_fields"] | undefined | null,
	var_samp?: GraphQLTypes["film_actor_var_samp_fields"] | undefined | null,
	variance?: GraphQLTypes["film_actor_variance_fields"] | undefined | null
};
	/** aggregate avg on columns */
["film_actor_avg_fields"]: {
	__typename: "film_actor_avg_fields",
	actor_id?: number | undefined | null,
	film_id?: number | undefined | null
};
	/** Boolean expression to filter rows from the table "film_actor". All fields are combined with a logical 'AND'. */
["film_actor_bool_exp"]: {
		_and?: Array<GraphQLTypes["film_actor_bool_exp"]> | undefined | null,
	_not?: GraphQLTypes["film_actor_bool_exp"] | undefined | null,
	_or?: Array<GraphQLTypes["film_actor_bool_exp"]> | undefined | null,
	actor_id?: GraphQLTypes["smallint_comparison_exp"] | undefined | null,
	film_id?: GraphQLTypes["smallint_comparison_exp"] | undefined | null,
	last_update?: GraphQLTypes["timestamp_comparison_exp"] | undefined | null
};
	/** unique or primary key constraints on table "film_actor" */
["film_actor_constraint"]: film_actor_constraint;
	/** input type for incrementing numeric columns in table "film_actor" */
["film_actor_inc_input"]: {
		actor_id?: GraphQLTypes["smallint"] | undefined | null,
	film_id?: GraphQLTypes["smallint"] | undefined | null
};
	/** input type for inserting data into table "film_actor" */
["film_actor_insert_input"]: {
		actor_id?: GraphQLTypes["smallint"] | undefined | null,
	film_id?: GraphQLTypes["smallint"] | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null
};
	/** aggregate max on columns */
["film_actor_max_fields"]: {
	__typename: "film_actor_max_fields",
	actor_id?: GraphQLTypes["smallint"] | undefined | null,
	film_id?: GraphQLTypes["smallint"] | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null
};
	/** aggregate min on columns */
["film_actor_min_fields"]: {
	__typename: "film_actor_min_fields",
	actor_id?: GraphQLTypes["smallint"] | undefined | null,
	film_id?: GraphQLTypes["smallint"] | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null
};
	/** response of any mutation on the table "film_actor" */
["film_actor_mutation_response"]: {
	__typename: "film_actor_mutation_response",
	/** number of rows affected by the mutation */
	affected_rows: number,
	/** data from the rows affected by the mutation */
	returning: Array<GraphQLTypes["film_actor"]>
};
	/** on_conflict condition type for table "film_actor" */
["film_actor_on_conflict"]: {
		constraint: GraphQLTypes["film_actor_constraint"],
	update_columns: Array<GraphQLTypes["film_actor_update_column"]>,
	where?: GraphQLTypes["film_actor_bool_exp"] | undefined | null
};
	/** Ordering options when selecting data from "film_actor". */
["film_actor_order_by"]: {
		actor_id?: GraphQLTypes["order_by"] | undefined | null,
	film_id?: GraphQLTypes["order_by"] | undefined | null,
	last_update?: GraphQLTypes["order_by"] | undefined | null
};
	/** primary key columns input for table: film_actor */
["film_actor_pk_columns_input"]: {
		actor_id: GraphQLTypes["smallint"],
	film_id: GraphQLTypes["smallint"]
};
	/** select columns of table "film_actor" */
["film_actor_select_column"]: film_actor_select_column;
	/** input type for updating data in table "film_actor" */
["film_actor_set_input"]: {
		actor_id?: GraphQLTypes["smallint"] | undefined | null,
	film_id?: GraphQLTypes["smallint"] | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null
};
	/** aggregate stddev on columns */
["film_actor_stddev_fields"]: {
	__typename: "film_actor_stddev_fields",
	actor_id?: number | undefined | null,
	film_id?: number | undefined | null
};
	/** aggregate stddev_pop on columns */
["film_actor_stddev_pop_fields"]: {
	__typename: "film_actor_stddev_pop_fields",
	actor_id?: number | undefined | null,
	film_id?: number | undefined | null
};
	/** aggregate stddev_samp on columns */
["film_actor_stddev_samp_fields"]: {
	__typename: "film_actor_stddev_samp_fields",
	actor_id?: number | undefined | null,
	film_id?: number | undefined | null
};
	/** Streaming cursor of the table "film_actor" */
["film_actor_stream_cursor_input"]: {
		/** Stream column input with initial value */
	initial_value: GraphQLTypes["film_actor_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: GraphQLTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["film_actor_stream_cursor_value_input"]: {
		actor_id?: GraphQLTypes["smallint"] | undefined | null,
	film_id?: GraphQLTypes["smallint"] | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null
};
	/** aggregate sum on columns */
["film_actor_sum_fields"]: {
	__typename: "film_actor_sum_fields",
	actor_id?: GraphQLTypes["smallint"] | undefined | null,
	film_id?: GraphQLTypes["smallint"] | undefined | null
};
	/** update columns of table "film_actor" */
["film_actor_update_column"]: film_actor_update_column;
	["film_actor_updates"]: {
		/** increments the numeric columns with given value of the filtered values */
	_inc?: GraphQLTypes["film_actor_inc_input"] | undefined | null,
	/** sets the columns of the filtered rows to the given values */
	_set?: GraphQLTypes["film_actor_set_input"] | undefined | null,
	/** filter the rows which have to be updated */
	where: GraphQLTypes["film_actor_bool_exp"]
};
	/** aggregate var_pop on columns */
["film_actor_var_pop_fields"]: {
	__typename: "film_actor_var_pop_fields",
	actor_id?: number | undefined | null,
	film_id?: number | undefined | null
};
	/** aggregate var_samp on columns */
["film_actor_var_samp_fields"]: {
	__typename: "film_actor_var_samp_fields",
	actor_id?: number | undefined | null,
	film_id?: number | undefined | null
};
	/** aggregate variance on columns */
["film_actor_variance_fields"]: {
	__typename: "film_actor_variance_fields",
	actor_id?: number | undefined | null,
	film_id?: number | undefined | null
};
	/** aggregated selection of "film" */
["film_aggregate"]: {
	__typename: "film_aggregate",
	aggregate?: GraphQLTypes["film_aggregate_fields"] | undefined | null,
	nodes: Array<GraphQLTypes["film"]>
};
	/** aggregate fields of "film" */
["film_aggregate_fields"]: {
	__typename: "film_aggregate_fields",
	avg?: GraphQLTypes["film_avg_fields"] | undefined | null,
	count: number,
	max?: GraphQLTypes["film_max_fields"] | undefined | null,
	min?: GraphQLTypes["film_min_fields"] | undefined | null,
	stddev?: GraphQLTypes["film_stddev_fields"] | undefined | null,
	stddev_pop?: GraphQLTypes["film_stddev_pop_fields"] | undefined | null,
	stddev_samp?: GraphQLTypes["film_stddev_samp_fields"] | undefined | null,
	sum?: GraphQLTypes["film_sum_fields"] | undefined | null,
	var_pop?: GraphQLTypes["film_var_pop_fields"] | undefined | null,
	var_samp?: GraphQLTypes["film_var_samp_fields"] | undefined | null,
	variance?: GraphQLTypes["film_variance_fields"] | undefined | null
};
	/** aggregate avg on columns */
["film_avg_fields"]: {
	__typename: "film_avg_fields",
	film_id?: number | undefined | null,
	language_id?: number | undefined | null,
	length?: number | undefined | null,
	release_year?: number | undefined | null,
	rental_duration?: number | undefined | null,
	rental_rate?: number | undefined | null,
	replacement_cost?: number | undefined | null
};
	/** Boolean expression to filter rows from the table "film". All fields are combined with a logical 'AND'. */
["film_bool_exp"]: {
		_and?: Array<GraphQLTypes["film_bool_exp"]> | undefined | null,
	_not?: GraphQLTypes["film_bool_exp"] | undefined | null,
	_or?: Array<GraphQLTypes["film_bool_exp"]> | undefined | null,
	description?: GraphQLTypes["String_comparison_exp"] | undefined | null,
	film_id?: GraphQLTypes["Int_comparison_exp"] | undefined | null,
	fulltext?: GraphQLTypes["tsvector_comparison_exp"] | undefined | null,
	language_id?: GraphQLTypes["smallint_comparison_exp"] | undefined | null,
	last_update?: GraphQLTypes["timestamp_comparison_exp"] | undefined | null,
	length?: GraphQLTypes["smallint_comparison_exp"] | undefined | null,
	rating?: GraphQLTypes["mpaa_rating_comparison_exp"] | undefined | null,
	release_year?: GraphQLTypes["Int_comparison_exp"] | undefined | null,
	rental_duration?: GraphQLTypes["smallint_comparison_exp"] | undefined | null,
	rental_rate?: GraphQLTypes["numeric_comparison_exp"] | undefined | null,
	replacement_cost?: GraphQLTypes["numeric_comparison_exp"] | undefined | null,
	special_features?: GraphQLTypes["_text_comparison_exp"] | undefined | null,
	title?: GraphQLTypes["String_comparison_exp"] | undefined | null
};
	/** columns and relationships of "film_category" */
["film_category"]: {
	__typename: "film_category",
	category_id: GraphQLTypes["smallint"],
	film_id: GraphQLTypes["smallint"],
	last_update: GraphQLTypes["timestamp"]
};
	/** aggregated selection of "film_category" */
["film_category_aggregate"]: {
	__typename: "film_category_aggregate",
	aggregate?: GraphQLTypes["film_category_aggregate_fields"] | undefined | null,
	nodes: Array<GraphQLTypes["film_category"]>
};
	/** aggregate fields of "film_category" */
["film_category_aggregate_fields"]: {
	__typename: "film_category_aggregate_fields",
	avg?: GraphQLTypes["film_category_avg_fields"] | undefined | null,
	count: number,
	max?: GraphQLTypes["film_category_max_fields"] | undefined | null,
	min?: GraphQLTypes["film_category_min_fields"] | undefined | null,
	stddev?: GraphQLTypes["film_category_stddev_fields"] | undefined | null,
	stddev_pop?: GraphQLTypes["film_category_stddev_pop_fields"] | undefined | null,
	stddev_samp?: GraphQLTypes["film_category_stddev_samp_fields"] | undefined | null,
	sum?: GraphQLTypes["film_category_sum_fields"] | undefined | null,
	var_pop?: GraphQLTypes["film_category_var_pop_fields"] | undefined | null,
	var_samp?: GraphQLTypes["film_category_var_samp_fields"] | undefined | null,
	variance?: GraphQLTypes["film_category_variance_fields"] | undefined | null
};
	/** aggregate avg on columns */
["film_category_avg_fields"]: {
	__typename: "film_category_avg_fields",
	category_id?: number | undefined | null,
	film_id?: number | undefined | null
};
	/** Boolean expression to filter rows from the table "film_category". All fields are combined with a logical 'AND'. */
["film_category_bool_exp"]: {
		_and?: Array<GraphQLTypes["film_category_bool_exp"]> | undefined | null,
	_not?: GraphQLTypes["film_category_bool_exp"] | undefined | null,
	_or?: Array<GraphQLTypes["film_category_bool_exp"]> | undefined | null,
	category_id?: GraphQLTypes["smallint_comparison_exp"] | undefined | null,
	film_id?: GraphQLTypes["smallint_comparison_exp"] | undefined | null,
	last_update?: GraphQLTypes["timestamp_comparison_exp"] | undefined | null
};
	/** unique or primary key constraints on table "film_category" */
["film_category_constraint"]: film_category_constraint;
	/** input type for incrementing numeric columns in table "film_category" */
["film_category_inc_input"]: {
		category_id?: GraphQLTypes["smallint"] | undefined | null,
	film_id?: GraphQLTypes["smallint"] | undefined | null
};
	/** input type for inserting data into table "film_category" */
["film_category_insert_input"]: {
		category_id?: GraphQLTypes["smallint"] | undefined | null,
	film_id?: GraphQLTypes["smallint"] | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null
};
	/** aggregate max on columns */
["film_category_max_fields"]: {
	__typename: "film_category_max_fields",
	category_id?: GraphQLTypes["smallint"] | undefined | null,
	film_id?: GraphQLTypes["smallint"] | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null
};
	/** aggregate min on columns */
["film_category_min_fields"]: {
	__typename: "film_category_min_fields",
	category_id?: GraphQLTypes["smallint"] | undefined | null,
	film_id?: GraphQLTypes["smallint"] | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null
};
	/** response of any mutation on the table "film_category" */
["film_category_mutation_response"]: {
	__typename: "film_category_mutation_response",
	/** number of rows affected by the mutation */
	affected_rows: number,
	/** data from the rows affected by the mutation */
	returning: Array<GraphQLTypes["film_category"]>
};
	/** on_conflict condition type for table "film_category" */
["film_category_on_conflict"]: {
		constraint: GraphQLTypes["film_category_constraint"],
	update_columns: Array<GraphQLTypes["film_category_update_column"]>,
	where?: GraphQLTypes["film_category_bool_exp"] | undefined | null
};
	/** Ordering options when selecting data from "film_category". */
["film_category_order_by"]: {
		category_id?: GraphQLTypes["order_by"] | undefined | null,
	film_id?: GraphQLTypes["order_by"] | undefined | null,
	last_update?: GraphQLTypes["order_by"] | undefined | null
};
	/** primary key columns input for table: film_category */
["film_category_pk_columns_input"]: {
		category_id: GraphQLTypes["smallint"],
	film_id: GraphQLTypes["smallint"]
};
	/** select columns of table "film_category" */
["film_category_select_column"]: film_category_select_column;
	/** input type for updating data in table "film_category" */
["film_category_set_input"]: {
		category_id?: GraphQLTypes["smallint"] | undefined | null,
	film_id?: GraphQLTypes["smallint"] | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null
};
	/** aggregate stddev on columns */
["film_category_stddev_fields"]: {
	__typename: "film_category_stddev_fields",
	category_id?: number | undefined | null,
	film_id?: number | undefined | null
};
	/** aggregate stddev_pop on columns */
["film_category_stddev_pop_fields"]: {
	__typename: "film_category_stddev_pop_fields",
	category_id?: number | undefined | null,
	film_id?: number | undefined | null
};
	/** aggregate stddev_samp on columns */
["film_category_stddev_samp_fields"]: {
	__typename: "film_category_stddev_samp_fields",
	category_id?: number | undefined | null,
	film_id?: number | undefined | null
};
	/** Streaming cursor of the table "film_category" */
["film_category_stream_cursor_input"]: {
		/** Stream column input with initial value */
	initial_value: GraphQLTypes["film_category_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: GraphQLTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["film_category_stream_cursor_value_input"]: {
		category_id?: GraphQLTypes["smallint"] | undefined | null,
	film_id?: GraphQLTypes["smallint"] | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null
};
	/** aggregate sum on columns */
["film_category_sum_fields"]: {
	__typename: "film_category_sum_fields",
	category_id?: GraphQLTypes["smallint"] | undefined | null,
	film_id?: GraphQLTypes["smallint"] | undefined | null
};
	/** update columns of table "film_category" */
["film_category_update_column"]: film_category_update_column;
	["film_category_updates"]: {
		/** increments the numeric columns with given value of the filtered values */
	_inc?: GraphQLTypes["film_category_inc_input"] | undefined | null,
	/** sets the columns of the filtered rows to the given values */
	_set?: GraphQLTypes["film_category_set_input"] | undefined | null,
	/** filter the rows which have to be updated */
	where: GraphQLTypes["film_category_bool_exp"]
};
	/** aggregate var_pop on columns */
["film_category_var_pop_fields"]: {
	__typename: "film_category_var_pop_fields",
	category_id?: number | undefined | null,
	film_id?: number | undefined | null
};
	/** aggregate var_samp on columns */
["film_category_var_samp_fields"]: {
	__typename: "film_category_var_samp_fields",
	category_id?: number | undefined | null,
	film_id?: number | undefined | null
};
	/** aggregate variance on columns */
["film_category_variance_fields"]: {
	__typename: "film_category_variance_fields",
	category_id?: number | undefined | null,
	film_id?: number | undefined | null
};
	/** unique or primary key constraints on table "film" */
["film_constraint"]: film_constraint;
	/** input type for incrementing numeric columns in table "film" */
["film_inc_input"]: {
		film_id?: number | undefined | null,
	language_id?: GraphQLTypes["smallint"] | undefined | null,
	length?: GraphQLTypes["smallint"] | undefined | null,
	release_year?: number | undefined | null,
	rental_duration?: GraphQLTypes["smallint"] | undefined | null,
	rental_rate?: GraphQLTypes["numeric"] | undefined | null,
	replacement_cost?: GraphQLTypes["numeric"] | undefined | null
};
	/** input type for inserting data into table "film" */
["film_insert_input"]: {
		description?: string | undefined | null,
	film_id?: number | undefined | null,
	fulltext?: GraphQLTypes["tsvector"] | undefined | null,
	language_id?: GraphQLTypes["smallint"] | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null,
	length?: GraphQLTypes["smallint"] | undefined | null,
	rating?: GraphQLTypes["mpaa_rating"] | undefined | null,
	release_year?: number | undefined | null,
	rental_duration?: GraphQLTypes["smallint"] | undefined | null,
	rental_rate?: GraphQLTypes["numeric"] | undefined | null,
	replacement_cost?: GraphQLTypes["numeric"] | undefined | null,
	special_features?: GraphQLTypes["_text"] | undefined | null,
	title?: string | undefined | null
};
	/** columns and relationships of "film_list" */
["film_list"]: {
	__typename: "film_list",
	actors?: string | undefined | null,
	category?: string | undefined | null,
	description?: string | undefined | null,
	fid?: number | undefined | null,
	length?: GraphQLTypes["smallint"] | undefined | null,
	price?: GraphQLTypes["numeric"] | undefined | null,
	rating?: GraphQLTypes["mpaa_rating"] | undefined | null,
	title?: string | undefined | null
};
	/** aggregated selection of "film_list" */
["film_list_aggregate"]: {
	__typename: "film_list_aggregate",
	aggregate?: GraphQLTypes["film_list_aggregate_fields"] | undefined | null,
	nodes: Array<GraphQLTypes["film_list"]>
};
	/** aggregate fields of "film_list" */
["film_list_aggregate_fields"]: {
	__typename: "film_list_aggregate_fields",
	avg?: GraphQLTypes["film_list_avg_fields"] | undefined | null,
	count: number,
	max?: GraphQLTypes["film_list_max_fields"] | undefined | null,
	min?: GraphQLTypes["film_list_min_fields"] | undefined | null,
	stddev?: GraphQLTypes["film_list_stddev_fields"] | undefined | null,
	stddev_pop?: GraphQLTypes["film_list_stddev_pop_fields"] | undefined | null,
	stddev_samp?: GraphQLTypes["film_list_stddev_samp_fields"] | undefined | null,
	sum?: GraphQLTypes["film_list_sum_fields"] | undefined | null,
	var_pop?: GraphQLTypes["film_list_var_pop_fields"] | undefined | null,
	var_samp?: GraphQLTypes["film_list_var_samp_fields"] | undefined | null,
	variance?: GraphQLTypes["film_list_variance_fields"] | undefined | null
};
	/** aggregate avg on columns */
["film_list_avg_fields"]: {
	__typename: "film_list_avg_fields",
	fid?: number | undefined | null,
	length?: number | undefined | null,
	price?: number | undefined | null
};
	/** Boolean expression to filter rows from the table "film_list". All fields are combined with a logical 'AND'. */
["film_list_bool_exp"]: {
		_and?: Array<GraphQLTypes["film_list_bool_exp"]> | undefined | null,
	_not?: GraphQLTypes["film_list_bool_exp"] | undefined | null,
	_or?: Array<GraphQLTypes["film_list_bool_exp"]> | undefined | null,
	actors?: GraphQLTypes["String_comparison_exp"] | undefined | null,
	category?: GraphQLTypes["String_comparison_exp"] | undefined | null,
	description?: GraphQLTypes["String_comparison_exp"] | undefined | null,
	fid?: GraphQLTypes["Int_comparison_exp"] | undefined | null,
	length?: GraphQLTypes["smallint_comparison_exp"] | undefined | null,
	price?: GraphQLTypes["numeric_comparison_exp"] | undefined | null,
	rating?: GraphQLTypes["mpaa_rating_comparison_exp"] | undefined | null,
	title?: GraphQLTypes["String_comparison_exp"] | undefined | null
};
	/** aggregate max on columns */
["film_list_max_fields"]: {
	__typename: "film_list_max_fields",
	actors?: string | undefined | null,
	category?: string | undefined | null,
	description?: string | undefined | null,
	fid?: number | undefined | null,
	length?: GraphQLTypes["smallint"] | undefined | null,
	price?: GraphQLTypes["numeric"] | undefined | null,
	rating?: GraphQLTypes["mpaa_rating"] | undefined | null,
	title?: string | undefined | null
};
	/** aggregate min on columns */
["film_list_min_fields"]: {
	__typename: "film_list_min_fields",
	actors?: string | undefined | null,
	category?: string | undefined | null,
	description?: string | undefined | null,
	fid?: number | undefined | null,
	length?: GraphQLTypes["smallint"] | undefined | null,
	price?: GraphQLTypes["numeric"] | undefined | null,
	rating?: GraphQLTypes["mpaa_rating"] | undefined | null,
	title?: string | undefined | null
};
	/** Ordering options when selecting data from "film_list". */
["film_list_order_by"]: {
		actors?: GraphQLTypes["order_by"] | undefined | null,
	category?: GraphQLTypes["order_by"] | undefined | null,
	description?: GraphQLTypes["order_by"] | undefined | null,
	fid?: GraphQLTypes["order_by"] | undefined | null,
	length?: GraphQLTypes["order_by"] | undefined | null,
	price?: GraphQLTypes["order_by"] | undefined | null,
	rating?: GraphQLTypes["order_by"] | undefined | null,
	title?: GraphQLTypes["order_by"] | undefined | null
};
	/** select columns of table "film_list" */
["film_list_select_column"]: film_list_select_column;
	/** aggregate stddev on columns */
["film_list_stddev_fields"]: {
	__typename: "film_list_stddev_fields",
	fid?: number | undefined | null,
	length?: number | undefined | null,
	price?: number | undefined | null
};
	/** aggregate stddev_pop on columns */
["film_list_stddev_pop_fields"]: {
	__typename: "film_list_stddev_pop_fields",
	fid?: number | undefined | null,
	length?: number | undefined | null,
	price?: number | undefined | null
};
	/** aggregate stddev_samp on columns */
["film_list_stddev_samp_fields"]: {
	__typename: "film_list_stddev_samp_fields",
	fid?: number | undefined | null,
	length?: number | undefined | null,
	price?: number | undefined | null
};
	/** Streaming cursor of the table "film_list" */
["film_list_stream_cursor_input"]: {
		/** Stream column input with initial value */
	initial_value: GraphQLTypes["film_list_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: GraphQLTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["film_list_stream_cursor_value_input"]: {
		actors?: string | undefined | null,
	category?: string | undefined | null,
	description?: string | undefined | null,
	fid?: number | undefined | null,
	length?: GraphQLTypes["smallint"] | undefined | null,
	price?: GraphQLTypes["numeric"] | undefined | null,
	rating?: GraphQLTypes["mpaa_rating"] | undefined | null,
	title?: string | undefined | null
};
	/** aggregate sum on columns */
["film_list_sum_fields"]: {
	__typename: "film_list_sum_fields",
	fid?: number | undefined | null,
	length?: GraphQLTypes["smallint"] | undefined | null,
	price?: GraphQLTypes["numeric"] | undefined | null
};
	/** aggregate var_pop on columns */
["film_list_var_pop_fields"]: {
	__typename: "film_list_var_pop_fields",
	fid?: number | undefined | null,
	length?: number | undefined | null,
	price?: number | undefined | null
};
	/** aggregate var_samp on columns */
["film_list_var_samp_fields"]: {
	__typename: "film_list_var_samp_fields",
	fid?: number | undefined | null,
	length?: number | undefined | null,
	price?: number | undefined | null
};
	/** aggregate variance on columns */
["film_list_variance_fields"]: {
	__typename: "film_list_variance_fields",
	fid?: number | undefined | null,
	length?: number | undefined | null,
	price?: number | undefined | null
};
	/** aggregate max on columns */
["film_max_fields"]: {
	__typename: "film_max_fields",
	description?: string | undefined | null,
	film_id?: number | undefined | null,
	language_id?: GraphQLTypes["smallint"] | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null,
	length?: GraphQLTypes["smallint"] | undefined | null,
	rating?: GraphQLTypes["mpaa_rating"] | undefined | null,
	release_year?: number | undefined | null,
	rental_duration?: GraphQLTypes["smallint"] | undefined | null,
	rental_rate?: GraphQLTypes["numeric"] | undefined | null,
	replacement_cost?: GraphQLTypes["numeric"] | undefined | null,
	title?: string | undefined | null
};
	/** aggregate min on columns */
["film_min_fields"]: {
	__typename: "film_min_fields",
	description?: string | undefined | null,
	film_id?: number | undefined | null,
	language_id?: GraphQLTypes["smallint"] | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null,
	length?: GraphQLTypes["smallint"] | undefined | null,
	rating?: GraphQLTypes["mpaa_rating"] | undefined | null,
	release_year?: number | undefined | null,
	rental_duration?: GraphQLTypes["smallint"] | undefined | null,
	rental_rate?: GraphQLTypes["numeric"] | undefined | null,
	replacement_cost?: GraphQLTypes["numeric"] | undefined | null,
	title?: string | undefined | null
};
	/** response of any mutation on the table "film" */
["film_mutation_response"]: {
	__typename: "film_mutation_response",
	/** number of rows affected by the mutation */
	affected_rows: number,
	/** data from the rows affected by the mutation */
	returning: Array<GraphQLTypes["film"]>
};
	/** on_conflict condition type for table "film" */
["film_on_conflict"]: {
		constraint: GraphQLTypes["film_constraint"],
	update_columns: Array<GraphQLTypes["film_update_column"]>,
	where?: GraphQLTypes["film_bool_exp"] | undefined | null
};
	/** Ordering options when selecting data from "film". */
["film_order_by"]: {
		description?: GraphQLTypes["order_by"] | undefined | null,
	film_id?: GraphQLTypes["order_by"] | undefined | null,
	fulltext?: GraphQLTypes["order_by"] | undefined | null,
	language_id?: GraphQLTypes["order_by"] | undefined | null,
	last_update?: GraphQLTypes["order_by"] | undefined | null,
	length?: GraphQLTypes["order_by"] | undefined | null,
	rating?: GraphQLTypes["order_by"] | undefined | null,
	release_year?: GraphQLTypes["order_by"] | undefined | null,
	rental_duration?: GraphQLTypes["order_by"] | undefined | null,
	rental_rate?: GraphQLTypes["order_by"] | undefined | null,
	replacement_cost?: GraphQLTypes["order_by"] | undefined | null,
	special_features?: GraphQLTypes["order_by"] | undefined | null,
	title?: GraphQLTypes["order_by"] | undefined | null
};
	/** primary key columns input for table: film */
["film_pk_columns_input"]: {
		film_id: number
};
	/** select columns of table "film" */
["film_select_column"]: film_select_column;
	/** input type for updating data in table "film" */
["film_set_input"]: {
		description?: string | undefined | null,
	film_id?: number | undefined | null,
	fulltext?: GraphQLTypes["tsvector"] | undefined | null,
	language_id?: GraphQLTypes["smallint"] | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null,
	length?: GraphQLTypes["smallint"] | undefined | null,
	rating?: GraphQLTypes["mpaa_rating"] | undefined | null,
	release_year?: number | undefined | null,
	rental_duration?: GraphQLTypes["smallint"] | undefined | null,
	rental_rate?: GraphQLTypes["numeric"] | undefined | null,
	replacement_cost?: GraphQLTypes["numeric"] | undefined | null,
	special_features?: GraphQLTypes["_text"] | undefined | null,
	title?: string | undefined | null
};
	/** aggregate stddev on columns */
["film_stddev_fields"]: {
	__typename: "film_stddev_fields",
	film_id?: number | undefined | null,
	language_id?: number | undefined | null,
	length?: number | undefined | null,
	release_year?: number | undefined | null,
	rental_duration?: number | undefined | null,
	rental_rate?: number | undefined | null,
	replacement_cost?: number | undefined | null
};
	/** aggregate stddev_pop on columns */
["film_stddev_pop_fields"]: {
	__typename: "film_stddev_pop_fields",
	film_id?: number | undefined | null,
	language_id?: number | undefined | null,
	length?: number | undefined | null,
	release_year?: number | undefined | null,
	rental_duration?: number | undefined | null,
	rental_rate?: number | undefined | null,
	replacement_cost?: number | undefined | null
};
	/** aggregate stddev_samp on columns */
["film_stddev_samp_fields"]: {
	__typename: "film_stddev_samp_fields",
	film_id?: number | undefined | null,
	language_id?: number | undefined | null,
	length?: number | undefined | null,
	release_year?: number | undefined | null,
	rental_duration?: number | undefined | null,
	rental_rate?: number | undefined | null,
	replacement_cost?: number | undefined | null
};
	/** Streaming cursor of the table "film" */
["film_stream_cursor_input"]: {
		/** Stream column input with initial value */
	initial_value: GraphQLTypes["film_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: GraphQLTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["film_stream_cursor_value_input"]: {
		description?: string | undefined | null,
	film_id?: number | undefined | null,
	fulltext?: GraphQLTypes["tsvector"] | undefined | null,
	language_id?: GraphQLTypes["smallint"] | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null,
	length?: GraphQLTypes["smallint"] | undefined | null,
	rating?: GraphQLTypes["mpaa_rating"] | undefined | null,
	release_year?: number | undefined | null,
	rental_duration?: GraphQLTypes["smallint"] | undefined | null,
	rental_rate?: GraphQLTypes["numeric"] | undefined | null,
	replacement_cost?: GraphQLTypes["numeric"] | undefined | null,
	special_features?: GraphQLTypes["_text"] | undefined | null,
	title?: string | undefined | null
};
	/** aggregate sum on columns */
["film_sum_fields"]: {
	__typename: "film_sum_fields",
	film_id?: number | undefined | null,
	language_id?: GraphQLTypes["smallint"] | undefined | null,
	length?: GraphQLTypes["smallint"] | undefined | null,
	release_year?: number | undefined | null,
	rental_duration?: GraphQLTypes["smallint"] | undefined | null,
	rental_rate?: GraphQLTypes["numeric"] | undefined | null,
	replacement_cost?: GraphQLTypes["numeric"] | undefined | null
};
	/** update columns of table "film" */
["film_update_column"]: film_update_column;
	["film_updates"]: {
		/** increments the numeric columns with given value of the filtered values */
	_inc?: GraphQLTypes["film_inc_input"] | undefined | null,
	/** sets the columns of the filtered rows to the given values */
	_set?: GraphQLTypes["film_set_input"] | undefined | null,
	/** filter the rows which have to be updated */
	where: GraphQLTypes["film_bool_exp"]
};
	/** aggregate var_pop on columns */
["film_var_pop_fields"]: {
	__typename: "film_var_pop_fields",
	film_id?: number | undefined | null,
	language_id?: number | undefined | null,
	length?: number | undefined | null,
	release_year?: number | undefined | null,
	rental_duration?: number | undefined | null,
	rental_rate?: number | undefined | null,
	replacement_cost?: number | undefined | null
};
	/** aggregate var_samp on columns */
["film_var_samp_fields"]: {
	__typename: "film_var_samp_fields",
	film_id?: number | undefined | null,
	language_id?: number | undefined | null,
	length?: number | undefined | null,
	release_year?: number | undefined | null,
	rental_duration?: number | undefined | null,
	rental_rate?: number | undefined | null,
	replacement_cost?: number | undefined | null
};
	/** aggregate variance on columns */
["film_variance_fields"]: {
	__typename: "film_variance_fields",
	film_id?: number | undefined | null,
	language_id?: number | undefined | null,
	length?: number | undefined | null,
	release_year?: number | undefined | null,
	rental_duration?: number | undefined | null,
	rental_rate?: number | undefined | null,
	replacement_cost?: number | undefined | null
};
	/** columns and relationships of "inventory" */
["inventory"]: {
	__typename: "inventory",
	film_id: GraphQLTypes["smallint"],
	inventory_id: number,
	last_update: GraphQLTypes["timestamp"],
	store_id: GraphQLTypes["smallint"]
};
	/** aggregated selection of "inventory" */
["inventory_aggregate"]: {
	__typename: "inventory_aggregate",
	aggregate?: GraphQLTypes["inventory_aggregate_fields"] | undefined | null,
	nodes: Array<GraphQLTypes["inventory"]>
};
	/** aggregate fields of "inventory" */
["inventory_aggregate_fields"]: {
	__typename: "inventory_aggregate_fields",
	avg?: GraphQLTypes["inventory_avg_fields"] | undefined | null,
	count: number,
	max?: GraphQLTypes["inventory_max_fields"] | undefined | null,
	min?: GraphQLTypes["inventory_min_fields"] | undefined | null,
	stddev?: GraphQLTypes["inventory_stddev_fields"] | undefined | null,
	stddev_pop?: GraphQLTypes["inventory_stddev_pop_fields"] | undefined | null,
	stddev_samp?: GraphQLTypes["inventory_stddev_samp_fields"] | undefined | null,
	sum?: GraphQLTypes["inventory_sum_fields"] | undefined | null,
	var_pop?: GraphQLTypes["inventory_var_pop_fields"] | undefined | null,
	var_samp?: GraphQLTypes["inventory_var_samp_fields"] | undefined | null,
	variance?: GraphQLTypes["inventory_variance_fields"] | undefined | null
};
	/** aggregate avg on columns */
["inventory_avg_fields"]: {
	__typename: "inventory_avg_fields",
	film_id?: number | undefined | null,
	inventory_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	/** Boolean expression to filter rows from the table "inventory". All fields are combined with a logical 'AND'. */
["inventory_bool_exp"]: {
		_and?: Array<GraphQLTypes["inventory_bool_exp"]> | undefined | null,
	_not?: GraphQLTypes["inventory_bool_exp"] | undefined | null,
	_or?: Array<GraphQLTypes["inventory_bool_exp"]> | undefined | null,
	film_id?: GraphQLTypes["smallint_comparison_exp"] | undefined | null,
	inventory_id?: GraphQLTypes["Int_comparison_exp"] | undefined | null,
	last_update?: GraphQLTypes["timestamp_comparison_exp"] | undefined | null,
	store_id?: GraphQLTypes["smallint_comparison_exp"] | undefined | null
};
	/** unique or primary key constraints on table "inventory" */
["inventory_constraint"]: inventory_constraint;
	/** input type for incrementing numeric columns in table "inventory" */
["inventory_inc_input"]: {
		film_id?: GraphQLTypes["smallint"] | undefined | null,
	inventory_id?: number | undefined | null,
	store_id?: GraphQLTypes["smallint"] | undefined | null
};
	/** input type for inserting data into table "inventory" */
["inventory_insert_input"]: {
		film_id?: GraphQLTypes["smallint"] | undefined | null,
	inventory_id?: number | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null,
	store_id?: GraphQLTypes["smallint"] | undefined | null
};
	/** aggregate max on columns */
["inventory_max_fields"]: {
	__typename: "inventory_max_fields",
	film_id?: GraphQLTypes["smallint"] | undefined | null,
	inventory_id?: number | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null,
	store_id?: GraphQLTypes["smallint"] | undefined | null
};
	/** aggregate min on columns */
["inventory_min_fields"]: {
	__typename: "inventory_min_fields",
	film_id?: GraphQLTypes["smallint"] | undefined | null,
	inventory_id?: number | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null,
	store_id?: GraphQLTypes["smallint"] | undefined | null
};
	/** response of any mutation on the table "inventory" */
["inventory_mutation_response"]: {
	__typename: "inventory_mutation_response",
	/** number of rows affected by the mutation */
	affected_rows: number,
	/** data from the rows affected by the mutation */
	returning: Array<GraphQLTypes["inventory"]>
};
	/** on_conflict condition type for table "inventory" */
["inventory_on_conflict"]: {
		constraint: GraphQLTypes["inventory_constraint"],
	update_columns: Array<GraphQLTypes["inventory_update_column"]>,
	where?: GraphQLTypes["inventory_bool_exp"] | undefined | null
};
	/** Ordering options when selecting data from "inventory". */
["inventory_order_by"]: {
		film_id?: GraphQLTypes["order_by"] | undefined | null,
	inventory_id?: GraphQLTypes["order_by"] | undefined | null,
	last_update?: GraphQLTypes["order_by"] | undefined | null,
	store_id?: GraphQLTypes["order_by"] | undefined | null
};
	/** primary key columns input for table: inventory */
["inventory_pk_columns_input"]: {
		inventory_id: number
};
	/** select columns of table "inventory" */
["inventory_select_column"]: inventory_select_column;
	/** input type for updating data in table "inventory" */
["inventory_set_input"]: {
		film_id?: GraphQLTypes["smallint"] | undefined | null,
	inventory_id?: number | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null,
	store_id?: GraphQLTypes["smallint"] | undefined | null
};
	/** aggregate stddev on columns */
["inventory_stddev_fields"]: {
	__typename: "inventory_stddev_fields",
	film_id?: number | undefined | null,
	inventory_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	/** aggregate stddev_pop on columns */
["inventory_stddev_pop_fields"]: {
	__typename: "inventory_stddev_pop_fields",
	film_id?: number | undefined | null,
	inventory_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	/** aggregate stddev_samp on columns */
["inventory_stddev_samp_fields"]: {
	__typename: "inventory_stddev_samp_fields",
	film_id?: number | undefined | null,
	inventory_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	/** Streaming cursor of the table "inventory" */
["inventory_stream_cursor_input"]: {
		/** Stream column input with initial value */
	initial_value: GraphQLTypes["inventory_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: GraphQLTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["inventory_stream_cursor_value_input"]: {
		film_id?: GraphQLTypes["smallint"] | undefined | null,
	inventory_id?: number | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null,
	store_id?: GraphQLTypes["smallint"] | undefined | null
};
	/** aggregate sum on columns */
["inventory_sum_fields"]: {
	__typename: "inventory_sum_fields",
	film_id?: GraphQLTypes["smallint"] | undefined | null,
	inventory_id?: number | undefined | null,
	store_id?: GraphQLTypes["smallint"] | undefined | null
};
	/** update columns of table "inventory" */
["inventory_update_column"]: inventory_update_column;
	["inventory_updates"]: {
		/** increments the numeric columns with given value of the filtered values */
	_inc?: GraphQLTypes["inventory_inc_input"] | undefined | null,
	/** sets the columns of the filtered rows to the given values */
	_set?: GraphQLTypes["inventory_set_input"] | undefined | null,
	/** filter the rows which have to be updated */
	where: GraphQLTypes["inventory_bool_exp"]
};
	/** aggregate var_pop on columns */
["inventory_var_pop_fields"]: {
	__typename: "inventory_var_pop_fields",
	film_id?: number | undefined | null,
	inventory_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	/** aggregate var_samp on columns */
["inventory_var_samp_fields"]: {
	__typename: "inventory_var_samp_fields",
	film_id?: number | undefined | null,
	inventory_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	/** aggregate variance on columns */
["inventory_variance_fields"]: {
	__typename: "inventory_variance_fields",
	film_id?: number | undefined | null,
	inventory_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	/** columns and relationships of "language" */
["language"]: {
	__typename: "language",
	language_id: number,
	last_update: GraphQLTypes["timestamp"],
	name: GraphQLTypes["bpchar"]
};
	/** aggregated selection of "language" */
["language_aggregate"]: {
	__typename: "language_aggregate",
	aggregate?: GraphQLTypes["language_aggregate_fields"] | undefined | null,
	nodes: Array<GraphQLTypes["language"]>
};
	/** aggregate fields of "language" */
["language_aggregate_fields"]: {
	__typename: "language_aggregate_fields",
	avg?: GraphQLTypes["language_avg_fields"] | undefined | null,
	count: number,
	max?: GraphQLTypes["language_max_fields"] | undefined | null,
	min?: GraphQLTypes["language_min_fields"] | undefined | null,
	stddev?: GraphQLTypes["language_stddev_fields"] | undefined | null,
	stddev_pop?: GraphQLTypes["language_stddev_pop_fields"] | undefined | null,
	stddev_samp?: GraphQLTypes["language_stddev_samp_fields"] | undefined | null,
	sum?: GraphQLTypes["language_sum_fields"] | undefined | null,
	var_pop?: GraphQLTypes["language_var_pop_fields"] | undefined | null,
	var_samp?: GraphQLTypes["language_var_samp_fields"] | undefined | null,
	variance?: GraphQLTypes["language_variance_fields"] | undefined | null
};
	/** aggregate avg on columns */
["language_avg_fields"]: {
	__typename: "language_avg_fields",
	language_id?: number | undefined | null
};
	/** Boolean expression to filter rows from the table "language". All fields are combined with a logical 'AND'. */
["language_bool_exp"]: {
		_and?: Array<GraphQLTypes["language_bool_exp"]> | undefined | null,
	_not?: GraphQLTypes["language_bool_exp"] | undefined | null,
	_or?: Array<GraphQLTypes["language_bool_exp"]> | undefined | null,
	language_id?: GraphQLTypes["Int_comparison_exp"] | undefined | null,
	last_update?: GraphQLTypes["timestamp_comparison_exp"] | undefined | null,
	name?: GraphQLTypes["bpchar_comparison_exp"] | undefined | null
};
	/** unique or primary key constraints on table "language" */
["language_constraint"]: language_constraint;
	/** input type for incrementing numeric columns in table "language" */
["language_inc_input"]: {
		language_id?: number | undefined | null
};
	/** input type for inserting data into table "language" */
["language_insert_input"]: {
		language_id?: number | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null,
	name?: GraphQLTypes["bpchar"] | undefined | null
};
	/** aggregate max on columns */
["language_max_fields"]: {
	__typename: "language_max_fields",
	language_id?: number | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null,
	name?: GraphQLTypes["bpchar"] | undefined | null
};
	/** aggregate min on columns */
["language_min_fields"]: {
	__typename: "language_min_fields",
	language_id?: number | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null,
	name?: GraphQLTypes["bpchar"] | undefined | null
};
	/** response of any mutation on the table "language" */
["language_mutation_response"]: {
	__typename: "language_mutation_response",
	/** number of rows affected by the mutation */
	affected_rows: number,
	/** data from the rows affected by the mutation */
	returning: Array<GraphQLTypes["language"]>
};
	/** on_conflict condition type for table "language" */
["language_on_conflict"]: {
		constraint: GraphQLTypes["language_constraint"],
	update_columns: Array<GraphQLTypes["language_update_column"]>,
	where?: GraphQLTypes["language_bool_exp"] | undefined | null
};
	/** Ordering options when selecting data from "language". */
["language_order_by"]: {
		language_id?: GraphQLTypes["order_by"] | undefined | null,
	last_update?: GraphQLTypes["order_by"] | undefined | null,
	name?: GraphQLTypes["order_by"] | undefined | null
};
	/** primary key columns input for table: language */
["language_pk_columns_input"]: {
		language_id: number
};
	/** select columns of table "language" */
["language_select_column"]: language_select_column;
	/** input type for updating data in table "language" */
["language_set_input"]: {
		language_id?: number | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null,
	name?: GraphQLTypes["bpchar"] | undefined | null
};
	/** aggregate stddev on columns */
["language_stddev_fields"]: {
	__typename: "language_stddev_fields",
	language_id?: number | undefined | null
};
	/** aggregate stddev_pop on columns */
["language_stddev_pop_fields"]: {
	__typename: "language_stddev_pop_fields",
	language_id?: number | undefined | null
};
	/** aggregate stddev_samp on columns */
["language_stddev_samp_fields"]: {
	__typename: "language_stddev_samp_fields",
	language_id?: number | undefined | null
};
	/** Streaming cursor of the table "language" */
["language_stream_cursor_input"]: {
		/** Stream column input with initial value */
	initial_value: GraphQLTypes["language_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: GraphQLTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["language_stream_cursor_value_input"]: {
		language_id?: number | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null,
	name?: GraphQLTypes["bpchar"] | undefined | null
};
	/** aggregate sum on columns */
["language_sum_fields"]: {
	__typename: "language_sum_fields",
	language_id?: number | undefined | null
};
	/** update columns of table "language" */
["language_update_column"]: language_update_column;
	["language_updates"]: {
		/** increments the numeric columns with given value of the filtered values */
	_inc?: GraphQLTypes["language_inc_input"] | undefined | null,
	/** sets the columns of the filtered rows to the given values */
	_set?: GraphQLTypes["language_set_input"] | undefined | null,
	/** filter the rows which have to be updated */
	where: GraphQLTypes["language_bool_exp"]
};
	/** aggregate var_pop on columns */
["language_var_pop_fields"]: {
	__typename: "language_var_pop_fields",
	language_id?: number | undefined | null
};
	/** aggregate var_samp on columns */
["language_var_samp_fields"]: {
	__typename: "language_var_samp_fields",
	language_id?: number | undefined | null
};
	/** aggregate variance on columns */
["language_variance_fields"]: {
	__typename: "language_variance_fields",
	language_id?: number | undefined | null
};
	["mpaa_rating"]: "scalar" & { name: "mpaa_rating" };
	/** Boolean expression to compare columns of type "mpaa_rating". All fields are combined with logical 'AND'. */
["mpaa_rating_comparison_exp"]: {
		_eq?: GraphQLTypes["mpaa_rating"] | undefined | null,
	_gt?: GraphQLTypes["mpaa_rating"] | undefined | null,
	_gte?: GraphQLTypes["mpaa_rating"] | undefined | null,
	_in?: Array<GraphQLTypes["mpaa_rating"]> | undefined | null,
	_is_null?: boolean | undefined | null,
	_lt?: GraphQLTypes["mpaa_rating"] | undefined | null,
	_lte?: GraphQLTypes["mpaa_rating"] | undefined | null,
	_neq?: GraphQLTypes["mpaa_rating"] | undefined | null,
	_nin?: Array<GraphQLTypes["mpaa_rating"]> | undefined | null
};
	/** mutation root */
["mutation_root"]: {
	__typename: "mutation_root",
	/** delete data from the table: "actor" */
	delete_actor?: GraphQLTypes["actor_mutation_response"] | undefined | null,
	/** delete single row from the table: "actor" */
	delete_actor_by_pk?: GraphQLTypes["actor"] | undefined | null,
	/** delete data from the table: "address" */
	delete_address?: GraphQLTypes["address_mutation_response"] | undefined | null,
	/** delete single row from the table: "address" */
	delete_address_by_pk?: GraphQLTypes["address"] | undefined | null,
	/** delete data from the table: "category" */
	delete_category?: GraphQLTypes["category_mutation_response"] | undefined | null,
	/** delete single row from the table: "category" */
	delete_category_by_pk?: GraphQLTypes["category"] | undefined | null,
	/** delete data from the table: "city" */
	delete_city?: GraphQLTypes["city_mutation_response"] | undefined | null,
	/** delete single row from the table: "city" */
	delete_city_by_pk?: GraphQLTypes["city"] | undefined | null,
	/** delete data from the table: "country" */
	delete_country?: GraphQLTypes["country_mutation_response"] | undefined | null,
	/** delete single row from the table: "country" */
	delete_country_by_pk?: GraphQLTypes["country"] | undefined | null,
	/** delete data from the table: "customer" */
	delete_customer?: GraphQLTypes["customer_mutation_response"] | undefined | null,
	/** delete single row from the table: "customer" */
	delete_customer_by_pk?: GraphQLTypes["customer"] | undefined | null,
	/** delete data from the table: "film" */
	delete_film?: GraphQLTypes["film_mutation_response"] | undefined | null,
	/** delete data from the table: "film_actor" */
	delete_film_actor?: GraphQLTypes["film_actor_mutation_response"] | undefined | null,
	/** delete single row from the table: "film_actor" */
	delete_film_actor_by_pk?: GraphQLTypes["film_actor"] | undefined | null,
	/** delete single row from the table: "film" */
	delete_film_by_pk?: GraphQLTypes["film"] | undefined | null,
	/** delete data from the table: "film_category" */
	delete_film_category?: GraphQLTypes["film_category_mutation_response"] | undefined | null,
	/** delete single row from the table: "film_category" */
	delete_film_category_by_pk?: GraphQLTypes["film_category"] | undefined | null,
	/** delete data from the table: "inventory" */
	delete_inventory?: GraphQLTypes["inventory_mutation_response"] | undefined | null,
	/** delete single row from the table: "inventory" */
	delete_inventory_by_pk?: GraphQLTypes["inventory"] | undefined | null,
	/** delete data from the table: "language" */
	delete_language?: GraphQLTypes["language_mutation_response"] | undefined | null,
	/** delete single row from the table: "language" */
	delete_language_by_pk?: GraphQLTypes["language"] | undefined | null,
	/** delete data from the table: "payment" */
	delete_payment?: GraphQLTypes["payment_mutation_response"] | undefined | null,
	/** delete single row from the table: "payment" */
	delete_payment_by_pk?: GraphQLTypes["payment"] | undefined | null,
	/** delete data from the table: "rental" */
	delete_rental?: GraphQLTypes["rental_mutation_response"] | undefined | null,
	/** delete single row from the table: "rental" */
	delete_rental_by_pk?: GraphQLTypes["rental"] | undefined | null,
	/** delete data from the table: "staff" */
	delete_staff?: GraphQLTypes["staff_mutation_response"] | undefined | null,
	/** delete single row from the table: "staff" */
	delete_staff_by_pk?: GraphQLTypes["staff"] | undefined | null,
	/** delete data from the table: "store" */
	delete_store?: GraphQLTypes["store_mutation_response"] | undefined | null,
	/** delete single row from the table: "store" */
	delete_store_by_pk?: GraphQLTypes["store"] | undefined | null,
	/** insert data into the table: "actor" */
	insert_actor?: GraphQLTypes["actor_mutation_response"] | undefined | null,
	/** insert a single row into the table: "actor" */
	insert_actor_one?: GraphQLTypes["actor"] | undefined | null,
	/** insert data into the table: "address" */
	insert_address?: GraphQLTypes["address_mutation_response"] | undefined | null,
	/** insert a single row into the table: "address" */
	insert_address_one?: GraphQLTypes["address"] | undefined | null,
	/** insert data into the table: "category" */
	insert_category?: GraphQLTypes["category_mutation_response"] | undefined | null,
	/** insert a single row into the table: "category" */
	insert_category_one?: GraphQLTypes["category"] | undefined | null,
	/** insert data into the table: "city" */
	insert_city?: GraphQLTypes["city_mutation_response"] | undefined | null,
	/** insert a single row into the table: "city" */
	insert_city_one?: GraphQLTypes["city"] | undefined | null,
	/** insert data into the table: "country" */
	insert_country?: GraphQLTypes["country_mutation_response"] | undefined | null,
	/** insert a single row into the table: "country" */
	insert_country_one?: GraphQLTypes["country"] | undefined | null,
	/** insert data into the table: "customer" */
	insert_customer?: GraphQLTypes["customer_mutation_response"] | undefined | null,
	/** insert a single row into the table: "customer" */
	insert_customer_one?: GraphQLTypes["customer"] | undefined | null,
	/** insert data into the table: "film" */
	insert_film?: GraphQLTypes["film_mutation_response"] | undefined | null,
	/** insert data into the table: "film_actor" */
	insert_film_actor?: GraphQLTypes["film_actor_mutation_response"] | undefined | null,
	/** insert a single row into the table: "film_actor" */
	insert_film_actor_one?: GraphQLTypes["film_actor"] | undefined | null,
	/** insert data into the table: "film_category" */
	insert_film_category?: GraphQLTypes["film_category_mutation_response"] | undefined | null,
	/** insert a single row into the table: "film_category" */
	insert_film_category_one?: GraphQLTypes["film_category"] | undefined | null,
	/** insert a single row into the table: "film" */
	insert_film_one?: GraphQLTypes["film"] | undefined | null,
	/** insert data into the table: "inventory" */
	insert_inventory?: GraphQLTypes["inventory_mutation_response"] | undefined | null,
	/** insert a single row into the table: "inventory" */
	insert_inventory_one?: GraphQLTypes["inventory"] | undefined | null,
	/** insert data into the table: "language" */
	insert_language?: GraphQLTypes["language_mutation_response"] | undefined | null,
	/** insert a single row into the table: "language" */
	insert_language_one?: GraphQLTypes["language"] | undefined | null,
	/** insert data into the table: "payment" */
	insert_payment?: GraphQLTypes["payment_mutation_response"] | undefined | null,
	/** insert a single row into the table: "payment" */
	insert_payment_one?: GraphQLTypes["payment"] | undefined | null,
	/** insert data into the table: "rental" */
	insert_rental?: GraphQLTypes["rental_mutation_response"] | undefined | null,
	/** insert a single row into the table: "rental" */
	insert_rental_one?: GraphQLTypes["rental"] | undefined | null,
	/** insert data into the table: "staff" */
	insert_staff?: GraphQLTypes["staff_mutation_response"] | undefined | null,
	/** insert a single row into the table: "staff" */
	insert_staff_one?: GraphQLTypes["staff"] | undefined | null,
	/** insert data into the table: "store" */
	insert_store?: GraphQLTypes["store_mutation_response"] | undefined | null,
	/** insert a single row into the table: "store" */
	insert_store_one?: GraphQLTypes["store"] | undefined | null,
	/** update data of the table: "actor" */
	update_actor?: GraphQLTypes["actor_mutation_response"] | undefined | null,
	/** update single row of the table: "actor" */
	update_actor_by_pk?: GraphQLTypes["actor"] | undefined | null,
	/** update multiples rows of table: "actor" */
	update_actor_many?: Array<GraphQLTypes["actor_mutation_response"] | undefined | null> | undefined | null,
	/** update data of the table: "address" */
	update_address?: GraphQLTypes["address_mutation_response"] | undefined | null,
	/** update single row of the table: "address" */
	update_address_by_pk?: GraphQLTypes["address"] | undefined | null,
	/** update multiples rows of table: "address" */
	update_address_many?: Array<GraphQLTypes["address_mutation_response"] | undefined | null> | undefined | null,
	/** update data of the table: "category" */
	update_category?: GraphQLTypes["category_mutation_response"] | undefined | null,
	/** update single row of the table: "category" */
	update_category_by_pk?: GraphQLTypes["category"] | undefined | null,
	/** update multiples rows of table: "category" */
	update_category_many?: Array<GraphQLTypes["category_mutation_response"] | undefined | null> | undefined | null,
	/** update data of the table: "city" */
	update_city?: GraphQLTypes["city_mutation_response"] | undefined | null,
	/** update single row of the table: "city" */
	update_city_by_pk?: GraphQLTypes["city"] | undefined | null,
	/** update multiples rows of table: "city" */
	update_city_many?: Array<GraphQLTypes["city_mutation_response"] | undefined | null> | undefined | null,
	/** update data of the table: "country" */
	update_country?: GraphQLTypes["country_mutation_response"] | undefined | null,
	/** update single row of the table: "country" */
	update_country_by_pk?: GraphQLTypes["country"] | undefined | null,
	/** update multiples rows of table: "country" */
	update_country_many?: Array<GraphQLTypes["country_mutation_response"] | undefined | null> | undefined | null,
	/** update data of the table: "customer" */
	update_customer?: GraphQLTypes["customer_mutation_response"] | undefined | null,
	/** update single row of the table: "customer" */
	update_customer_by_pk?: GraphQLTypes["customer"] | undefined | null,
	/** update multiples rows of table: "customer" */
	update_customer_many?: Array<GraphQLTypes["customer_mutation_response"] | undefined | null> | undefined | null,
	/** update data of the table: "film" */
	update_film?: GraphQLTypes["film_mutation_response"] | undefined | null,
	/** update data of the table: "film_actor" */
	update_film_actor?: GraphQLTypes["film_actor_mutation_response"] | undefined | null,
	/** update single row of the table: "film_actor" */
	update_film_actor_by_pk?: GraphQLTypes["film_actor"] | undefined | null,
	/** update multiples rows of table: "film_actor" */
	update_film_actor_many?: Array<GraphQLTypes["film_actor_mutation_response"] | undefined | null> | undefined | null,
	/** update single row of the table: "film" */
	update_film_by_pk?: GraphQLTypes["film"] | undefined | null,
	/** update data of the table: "film_category" */
	update_film_category?: GraphQLTypes["film_category_mutation_response"] | undefined | null,
	/** update single row of the table: "film_category" */
	update_film_category_by_pk?: GraphQLTypes["film_category"] | undefined | null,
	/** update multiples rows of table: "film_category" */
	update_film_category_many?: Array<GraphQLTypes["film_category_mutation_response"] | undefined | null> | undefined | null,
	/** update multiples rows of table: "film" */
	update_film_many?: Array<GraphQLTypes["film_mutation_response"] | undefined | null> | undefined | null,
	/** update data of the table: "inventory" */
	update_inventory?: GraphQLTypes["inventory_mutation_response"] | undefined | null,
	/** update single row of the table: "inventory" */
	update_inventory_by_pk?: GraphQLTypes["inventory"] | undefined | null,
	/** update multiples rows of table: "inventory" */
	update_inventory_many?: Array<GraphQLTypes["inventory_mutation_response"] | undefined | null> | undefined | null,
	/** update data of the table: "language" */
	update_language?: GraphQLTypes["language_mutation_response"] | undefined | null,
	/** update single row of the table: "language" */
	update_language_by_pk?: GraphQLTypes["language"] | undefined | null,
	/** update multiples rows of table: "language" */
	update_language_many?: Array<GraphQLTypes["language_mutation_response"] | undefined | null> | undefined | null,
	/** update data of the table: "payment" */
	update_payment?: GraphQLTypes["payment_mutation_response"] | undefined | null,
	/** update single row of the table: "payment" */
	update_payment_by_pk?: GraphQLTypes["payment"] | undefined | null,
	/** update multiples rows of table: "payment" */
	update_payment_many?: Array<GraphQLTypes["payment_mutation_response"] | undefined | null> | undefined | null,
	/** update data of the table: "rental" */
	update_rental?: GraphQLTypes["rental_mutation_response"] | undefined | null,
	/** update single row of the table: "rental" */
	update_rental_by_pk?: GraphQLTypes["rental"] | undefined | null,
	/** update multiples rows of table: "rental" */
	update_rental_many?: Array<GraphQLTypes["rental_mutation_response"] | undefined | null> | undefined | null,
	/** update data of the table: "staff" */
	update_staff?: GraphQLTypes["staff_mutation_response"] | undefined | null,
	/** update single row of the table: "staff" */
	update_staff_by_pk?: GraphQLTypes["staff"] | undefined | null,
	/** update multiples rows of table: "staff" */
	update_staff_many?: Array<GraphQLTypes["staff_mutation_response"] | undefined | null> | undefined | null,
	/** update data of the table: "store" */
	update_store?: GraphQLTypes["store_mutation_response"] | undefined | null,
	/** update single row of the table: "store" */
	update_store_by_pk?: GraphQLTypes["store"] | undefined | null,
	/** update multiples rows of table: "store" */
	update_store_many?: Array<GraphQLTypes["store_mutation_response"] | undefined | null> | undefined | null
};
	/** columns and relationships of "nicer_but_slower_film_list" */
["nicer_but_slower_film_list"]: {
	__typename: "nicer_but_slower_film_list",
	actors?: string | undefined | null,
	category?: string | undefined | null,
	description?: string | undefined | null,
	fid?: number | undefined | null,
	length?: GraphQLTypes["smallint"] | undefined | null,
	price?: GraphQLTypes["numeric"] | undefined | null,
	rating?: GraphQLTypes["mpaa_rating"] | undefined | null,
	title?: string | undefined | null
};
	/** aggregated selection of "nicer_but_slower_film_list" */
["nicer_but_slower_film_list_aggregate"]: {
	__typename: "nicer_but_slower_film_list_aggregate",
	aggregate?: GraphQLTypes["nicer_but_slower_film_list_aggregate_fields"] | undefined | null,
	nodes: Array<GraphQLTypes["nicer_but_slower_film_list"]>
};
	/** aggregate fields of "nicer_but_slower_film_list" */
["nicer_but_slower_film_list_aggregate_fields"]: {
	__typename: "nicer_but_slower_film_list_aggregate_fields",
	avg?: GraphQLTypes["nicer_but_slower_film_list_avg_fields"] | undefined | null,
	count: number,
	max?: GraphQLTypes["nicer_but_slower_film_list_max_fields"] | undefined | null,
	min?: GraphQLTypes["nicer_but_slower_film_list_min_fields"] | undefined | null,
	stddev?: GraphQLTypes["nicer_but_slower_film_list_stddev_fields"] | undefined | null,
	stddev_pop?: GraphQLTypes["nicer_but_slower_film_list_stddev_pop_fields"] | undefined | null,
	stddev_samp?: GraphQLTypes["nicer_but_slower_film_list_stddev_samp_fields"] | undefined | null,
	sum?: GraphQLTypes["nicer_but_slower_film_list_sum_fields"] | undefined | null,
	var_pop?: GraphQLTypes["nicer_but_slower_film_list_var_pop_fields"] | undefined | null,
	var_samp?: GraphQLTypes["nicer_but_slower_film_list_var_samp_fields"] | undefined | null,
	variance?: GraphQLTypes["nicer_but_slower_film_list_variance_fields"] | undefined | null
};
	/** aggregate avg on columns */
["nicer_but_slower_film_list_avg_fields"]: {
	__typename: "nicer_but_slower_film_list_avg_fields",
	fid?: number | undefined | null,
	length?: number | undefined | null,
	price?: number | undefined | null
};
	/** Boolean expression to filter rows from the table "nicer_but_slower_film_list". All fields are combined with a logical 'AND'. */
["nicer_but_slower_film_list_bool_exp"]: {
		_and?: Array<GraphQLTypes["nicer_but_slower_film_list_bool_exp"]> | undefined | null,
	_not?: GraphQLTypes["nicer_but_slower_film_list_bool_exp"] | undefined | null,
	_or?: Array<GraphQLTypes["nicer_but_slower_film_list_bool_exp"]> | undefined | null,
	actors?: GraphQLTypes["String_comparison_exp"] | undefined | null,
	category?: GraphQLTypes["String_comparison_exp"] | undefined | null,
	description?: GraphQLTypes["String_comparison_exp"] | undefined | null,
	fid?: GraphQLTypes["Int_comparison_exp"] | undefined | null,
	length?: GraphQLTypes["smallint_comparison_exp"] | undefined | null,
	price?: GraphQLTypes["numeric_comparison_exp"] | undefined | null,
	rating?: GraphQLTypes["mpaa_rating_comparison_exp"] | undefined | null,
	title?: GraphQLTypes["String_comparison_exp"] | undefined | null
};
	/** aggregate max on columns */
["nicer_but_slower_film_list_max_fields"]: {
	__typename: "nicer_but_slower_film_list_max_fields",
	actors?: string | undefined | null,
	category?: string | undefined | null,
	description?: string | undefined | null,
	fid?: number | undefined | null,
	length?: GraphQLTypes["smallint"] | undefined | null,
	price?: GraphQLTypes["numeric"] | undefined | null,
	rating?: GraphQLTypes["mpaa_rating"] | undefined | null,
	title?: string | undefined | null
};
	/** aggregate min on columns */
["nicer_but_slower_film_list_min_fields"]: {
	__typename: "nicer_but_slower_film_list_min_fields",
	actors?: string | undefined | null,
	category?: string | undefined | null,
	description?: string | undefined | null,
	fid?: number | undefined | null,
	length?: GraphQLTypes["smallint"] | undefined | null,
	price?: GraphQLTypes["numeric"] | undefined | null,
	rating?: GraphQLTypes["mpaa_rating"] | undefined | null,
	title?: string | undefined | null
};
	/** Ordering options when selecting data from "nicer_but_slower_film_list". */
["nicer_but_slower_film_list_order_by"]: {
		actors?: GraphQLTypes["order_by"] | undefined | null,
	category?: GraphQLTypes["order_by"] | undefined | null,
	description?: GraphQLTypes["order_by"] | undefined | null,
	fid?: GraphQLTypes["order_by"] | undefined | null,
	length?: GraphQLTypes["order_by"] | undefined | null,
	price?: GraphQLTypes["order_by"] | undefined | null,
	rating?: GraphQLTypes["order_by"] | undefined | null,
	title?: GraphQLTypes["order_by"] | undefined | null
};
	/** select columns of table "nicer_but_slower_film_list" */
["nicer_but_slower_film_list_select_column"]: nicer_but_slower_film_list_select_column;
	/** aggregate stddev on columns */
["nicer_but_slower_film_list_stddev_fields"]: {
	__typename: "nicer_but_slower_film_list_stddev_fields",
	fid?: number | undefined | null,
	length?: number | undefined | null,
	price?: number | undefined | null
};
	/** aggregate stddev_pop on columns */
["nicer_but_slower_film_list_stddev_pop_fields"]: {
	__typename: "nicer_but_slower_film_list_stddev_pop_fields",
	fid?: number | undefined | null,
	length?: number | undefined | null,
	price?: number | undefined | null
};
	/** aggregate stddev_samp on columns */
["nicer_but_slower_film_list_stddev_samp_fields"]: {
	__typename: "nicer_but_slower_film_list_stddev_samp_fields",
	fid?: number | undefined | null,
	length?: number | undefined | null,
	price?: number | undefined | null
};
	/** Streaming cursor of the table "nicer_but_slower_film_list" */
["nicer_but_slower_film_list_stream_cursor_input"]: {
		/** Stream column input with initial value */
	initial_value: GraphQLTypes["nicer_but_slower_film_list_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: GraphQLTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["nicer_but_slower_film_list_stream_cursor_value_input"]: {
		actors?: string | undefined | null,
	category?: string | undefined | null,
	description?: string | undefined | null,
	fid?: number | undefined | null,
	length?: GraphQLTypes["smallint"] | undefined | null,
	price?: GraphQLTypes["numeric"] | undefined | null,
	rating?: GraphQLTypes["mpaa_rating"] | undefined | null,
	title?: string | undefined | null
};
	/** aggregate sum on columns */
["nicer_but_slower_film_list_sum_fields"]: {
	__typename: "nicer_but_slower_film_list_sum_fields",
	fid?: number | undefined | null,
	length?: GraphQLTypes["smallint"] | undefined | null,
	price?: GraphQLTypes["numeric"] | undefined | null
};
	/** aggregate var_pop on columns */
["nicer_but_slower_film_list_var_pop_fields"]: {
	__typename: "nicer_but_slower_film_list_var_pop_fields",
	fid?: number | undefined | null,
	length?: number | undefined | null,
	price?: number | undefined | null
};
	/** aggregate var_samp on columns */
["nicer_but_slower_film_list_var_samp_fields"]: {
	__typename: "nicer_but_slower_film_list_var_samp_fields",
	fid?: number | undefined | null,
	length?: number | undefined | null,
	price?: number | undefined | null
};
	/** aggregate variance on columns */
["nicer_but_slower_film_list_variance_fields"]: {
	__typename: "nicer_but_slower_film_list_variance_fields",
	fid?: number | undefined | null,
	length?: number | undefined | null,
	price?: number | undefined | null
};
	["numeric"]: "scalar" & { name: "numeric" };
	/** Boolean expression to compare columns of type "numeric". All fields are combined with logical 'AND'. */
["numeric_comparison_exp"]: {
		_eq?: GraphQLTypes["numeric"] | undefined | null,
	_gt?: GraphQLTypes["numeric"] | undefined | null,
	_gte?: GraphQLTypes["numeric"] | undefined | null,
	_in?: Array<GraphQLTypes["numeric"]> | undefined | null,
	_is_null?: boolean | undefined | null,
	_lt?: GraphQLTypes["numeric"] | undefined | null,
	_lte?: GraphQLTypes["numeric"] | undefined | null,
	_neq?: GraphQLTypes["numeric"] | undefined | null,
	_nin?: Array<GraphQLTypes["numeric"]> | undefined | null
};
	/** column ordering options */
["order_by"]: order_by;
	/** columns and relationships of "payment" */
["payment"]: {
	__typename: "payment",
	amount: GraphQLTypes["numeric"],
	customer_id: GraphQLTypes["smallint"],
	payment_date: GraphQLTypes["timestamp"],
	payment_id: number,
	rental_id: number,
	staff_id: GraphQLTypes["smallint"]
};
	/** aggregated selection of "payment" */
["payment_aggregate"]: {
	__typename: "payment_aggregate",
	aggregate?: GraphQLTypes["payment_aggregate_fields"] | undefined | null,
	nodes: Array<GraphQLTypes["payment"]>
};
	/** aggregate fields of "payment" */
["payment_aggregate_fields"]: {
	__typename: "payment_aggregate_fields",
	avg?: GraphQLTypes["payment_avg_fields"] | undefined | null,
	count: number,
	max?: GraphQLTypes["payment_max_fields"] | undefined | null,
	min?: GraphQLTypes["payment_min_fields"] | undefined | null,
	stddev?: GraphQLTypes["payment_stddev_fields"] | undefined | null,
	stddev_pop?: GraphQLTypes["payment_stddev_pop_fields"] | undefined | null,
	stddev_samp?: GraphQLTypes["payment_stddev_samp_fields"] | undefined | null,
	sum?: GraphQLTypes["payment_sum_fields"] | undefined | null,
	var_pop?: GraphQLTypes["payment_var_pop_fields"] | undefined | null,
	var_samp?: GraphQLTypes["payment_var_samp_fields"] | undefined | null,
	variance?: GraphQLTypes["payment_variance_fields"] | undefined | null
};
	/** aggregate avg on columns */
["payment_avg_fields"]: {
	__typename: "payment_avg_fields",
	amount?: number | undefined | null,
	customer_id?: number | undefined | null,
	payment_id?: number | undefined | null,
	rental_id?: number | undefined | null,
	staff_id?: number | undefined | null
};
	/** Boolean expression to filter rows from the table "payment". All fields are combined with a logical 'AND'. */
["payment_bool_exp"]: {
		_and?: Array<GraphQLTypes["payment_bool_exp"]> | undefined | null,
	_not?: GraphQLTypes["payment_bool_exp"] | undefined | null,
	_or?: Array<GraphQLTypes["payment_bool_exp"]> | undefined | null,
	amount?: GraphQLTypes["numeric_comparison_exp"] | undefined | null,
	customer_id?: GraphQLTypes["smallint_comparison_exp"] | undefined | null,
	payment_date?: GraphQLTypes["timestamp_comparison_exp"] | undefined | null,
	payment_id?: GraphQLTypes["Int_comparison_exp"] | undefined | null,
	rental_id?: GraphQLTypes["Int_comparison_exp"] | undefined | null,
	staff_id?: GraphQLTypes["smallint_comparison_exp"] | undefined | null
};
	/** unique or primary key constraints on table "payment" */
["payment_constraint"]: payment_constraint;
	/** input type for incrementing numeric columns in table "payment" */
["payment_inc_input"]: {
		amount?: GraphQLTypes["numeric"] | undefined | null,
	customer_id?: GraphQLTypes["smallint"] | undefined | null,
	payment_id?: number | undefined | null,
	rental_id?: number | undefined | null,
	staff_id?: GraphQLTypes["smallint"] | undefined | null
};
	/** input type for inserting data into table "payment" */
["payment_insert_input"]: {
		amount?: GraphQLTypes["numeric"] | undefined | null,
	customer_id?: GraphQLTypes["smallint"] | undefined | null,
	payment_date?: GraphQLTypes["timestamp"] | undefined | null,
	payment_id?: number | undefined | null,
	rental_id?: number | undefined | null,
	staff_id?: GraphQLTypes["smallint"] | undefined | null
};
	/** aggregate max on columns */
["payment_max_fields"]: {
	__typename: "payment_max_fields",
	amount?: GraphQLTypes["numeric"] | undefined | null,
	customer_id?: GraphQLTypes["smallint"] | undefined | null,
	payment_date?: GraphQLTypes["timestamp"] | undefined | null,
	payment_id?: number | undefined | null,
	rental_id?: number | undefined | null,
	staff_id?: GraphQLTypes["smallint"] | undefined | null
};
	/** aggregate min on columns */
["payment_min_fields"]: {
	__typename: "payment_min_fields",
	amount?: GraphQLTypes["numeric"] | undefined | null,
	customer_id?: GraphQLTypes["smallint"] | undefined | null,
	payment_date?: GraphQLTypes["timestamp"] | undefined | null,
	payment_id?: number | undefined | null,
	rental_id?: number | undefined | null,
	staff_id?: GraphQLTypes["smallint"] | undefined | null
};
	/** response of any mutation on the table "payment" */
["payment_mutation_response"]: {
	__typename: "payment_mutation_response",
	/** number of rows affected by the mutation */
	affected_rows: number,
	/** data from the rows affected by the mutation */
	returning: Array<GraphQLTypes["payment"]>
};
	/** on_conflict condition type for table "payment" */
["payment_on_conflict"]: {
		constraint: GraphQLTypes["payment_constraint"],
	update_columns: Array<GraphQLTypes["payment_update_column"]>,
	where?: GraphQLTypes["payment_bool_exp"] | undefined | null
};
	/** Ordering options when selecting data from "payment". */
["payment_order_by"]: {
		amount?: GraphQLTypes["order_by"] | undefined | null,
	customer_id?: GraphQLTypes["order_by"] | undefined | null,
	payment_date?: GraphQLTypes["order_by"] | undefined | null,
	payment_id?: GraphQLTypes["order_by"] | undefined | null,
	rental_id?: GraphQLTypes["order_by"] | undefined | null,
	staff_id?: GraphQLTypes["order_by"] | undefined | null
};
	/** primary key columns input for table: payment */
["payment_pk_columns_input"]: {
		payment_id: number
};
	/** select columns of table "payment" */
["payment_select_column"]: payment_select_column;
	/** input type for updating data in table "payment" */
["payment_set_input"]: {
		amount?: GraphQLTypes["numeric"] | undefined | null,
	customer_id?: GraphQLTypes["smallint"] | undefined | null,
	payment_date?: GraphQLTypes["timestamp"] | undefined | null,
	payment_id?: number | undefined | null,
	rental_id?: number | undefined | null,
	staff_id?: GraphQLTypes["smallint"] | undefined | null
};
	/** aggregate stddev on columns */
["payment_stddev_fields"]: {
	__typename: "payment_stddev_fields",
	amount?: number | undefined | null,
	customer_id?: number | undefined | null,
	payment_id?: number | undefined | null,
	rental_id?: number | undefined | null,
	staff_id?: number | undefined | null
};
	/** aggregate stddev_pop on columns */
["payment_stddev_pop_fields"]: {
	__typename: "payment_stddev_pop_fields",
	amount?: number | undefined | null,
	customer_id?: number | undefined | null,
	payment_id?: number | undefined | null,
	rental_id?: number | undefined | null,
	staff_id?: number | undefined | null
};
	/** aggregate stddev_samp on columns */
["payment_stddev_samp_fields"]: {
	__typename: "payment_stddev_samp_fields",
	amount?: number | undefined | null,
	customer_id?: number | undefined | null,
	payment_id?: number | undefined | null,
	rental_id?: number | undefined | null,
	staff_id?: number | undefined | null
};
	/** Streaming cursor of the table "payment" */
["payment_stream_cursor_input"]: {
		/** Stream column input with initial value */
	initial_value: GraphQLTypes["payment_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: GraphQLTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["payment_stream_cursor_value_input"]: {
		amount?: GraphQLTypes["numeric"] | undefined | null,
	customer_id?: GraphQLTypes["smallint"] | undefined | null,
	payment_date?: GraphQLTypes["timestamp"] | undefined | null,
	payment_id?: number | undefined | null,
	rental_id?: number | undefined | null,
	staff_id?: GraphQLTypes["smallint"] | undefined | null
};
	/** aggregate sum on columns */
["payment_sum_fields"]: {
	__typename: "payment_sum_fields",
	amount?: GraphQLTypes["numeric"] | undefined | null,
	customer_id?: GraphQLTypes["smallint"] | undefined | null,
	payment_id?: number | undefined | null,
	rental_id?: number | undefined | null,
	staff_id?: GraphQLTypes["smallint"] | undefined | null
};
	/** update columns of table "payment" */
["payment_update_column"]: payment_update_column;
	["payment_updates"]: {
		/** increments the numeric columns with given value of the filtered values */
	_inc?: GraphQLTypes["payment_inc_input"] | undefined | null,
	/** sets the columns of the filtered rows to the given values */
	_set?: GraphQLTypes["payment_set_input"] | undefined | null,
	/** filter the rows which have to be updated */
	where: GraphQLTypes["payment_bool_exp"]
};
	/** aggregate var_pop on columns */
["payment_var_pop_fields"]: {
	__typename: "payment_var_pop_fields",
	amount?: number | undefined | null,
	customer_id?: number | undefined | null,
	payment_id?: number | undefined | null,
	rental_id?: number | undefined | null,
	staff_id?: number | undefined | null
};
	/** aggregate var_samp on columns */
["payment_var_samp_fields"]: {
	__typename: "payment_var_samp_fields",
	amount?: number | undefined | null,
	customer_id?: number | undefined | null,
	payment_id?: number | undefined | null,
	rental_id?: number | undefined | null,
	staff_id?: number | undefined | null
};
	/** aggregate variance on columns */
["payment_variance_fields"]: {
	__typename: "payment_variance_fields",
	amount?: number | undefined | null,
	customer_id?: number | undefined | null,
	payment_id?: number | undefined | null,
	rental_id?: number | undefined | null,
	staff_id?: number | undefined | null
};
	["query_root"]: {
	__typename: "query_root",
	/** fetch data from the table: "actor" */
	actor: Array<GraphQLTypes["actor"]>,
	/** fetch aggregated fields from the table: "actor" */
	actor_aggregate: GraphQLTypes["actor_aggregate"],
	/** fetch data from the table: "actor" using primary key columns */
	actor_by_pk?: GraphQLTypes["actor"] | undefined | null,
	/** fetch data from the table: "actor_info" */
	actor_info: Array<GraphQLTypes["actor_info"]>,
	/** fetch aggregated fields from the table: "actor_info" */
	actor_info_aggregate: GraphQLTypes["actor_info_aggregate"],
	/** fetch data from the table: "address" */
	address: Array<GraphQLTypes["address"]>,
	/** fetch aggregated fields from the table: "address" */
	address_aggregate: GraphQLTypes["address_aggregate"],
	/** fetch data from the table: "address" using primary key columns */
	address_by_pk?: GraphQLTypes["address"] | undefined | null,
	/** fetch data from the table: "category" */
	category: Array<GraphQLTypes["category"]>,
	/** fetch aggregated fields from the table: "category" */
	category_aggregate: GraphQLTypes["category_aggregate"],
	/** fetch data from the table: "category" using primary key columns */
	category_by_pk?: GraphQLTypes["category"] | undefined | null,
	/** fetch data from the table: "city" */
	city: Array<GraphQLTypes["city"]>,
	/** fetch aggregated fields from the table: "city" */
	city_aggregate: GraphQLTypes["city_aggregate"],
	/** fetch data from the table: "city" using primary key columns */
	city_by_pk?: GraphQLTypes["city"] | undefined | null,
	/** fetch data from the table: "country" */
	country: Array<GraphQLTypes["country"]>,
	/** fetch aggregated fields from the table: "country" */
	country_aggregate: GraphQLTypes["country_aggregate"],
	/** fetch data from the table: "country" using primary key columns */
	country_by_pk?: GraphQLTypes["country"] | undefined | null,
	/** fetch data from the table: "customer" */
	customer: Array<GraphQLTypes["customer"]>,
	/** fetch aggregated fields from the table: "customer" */
	customer_aggregate: GraphQLTypes["customer_aggregate"],
	/** fetch data from the table: "customer" using primary key columns */
	customer_by_pk?: GraphQLTypes["customer"] | undefined | null,
	/** fetch data from the table: "customer_list" */
	customer_list: Array<GraphQLTypes["customer_list"]>,
	/** fetch aggregated fields from the table: "customer_list" */
	customer_list_aggregate: GraphQLTypes["customer_list_aggregate"],
	/** fetch data from the table: "film" */
	film: Array<GraphQLTypes["film"]>,
	/** fetch data from the table: "film_actor" */
	film_actor: Array<GraphQLTypes["film_actor"]>,
	/** fetch aggregated fields from the table: "film_actor" */
	film_actor_aggregate: GraphQLTypes["film_actor_aggregate"],
	/** fetch data from the table: "film_actor" using primary key columns */
	film_actor_by_pk?: GraphQLTypes["film_actor"] | undefined | null,
	/** fetch aggregated fields from the table: "film" */
	film_aggregate: GraphQLTypes["film_aggregate"],
	/** fetch data from the table: "film" using primary key columns */
	film_by_pk?: GraphQLTypes["film"] | undefined | null,
	/** fetch data from the table: "film_category" */
	film_category: Array<GraphQLTypes["film_category"]>,
	/** fetch aggregated fields from the table: "film_category" */
	film_category_aggregate: GraphQLTypes["film_category_aggregate"],
	/** fetch data from the table: "film_category" using primary key columns */
	film_category_by_pk?: GraphQLTypes["film_category"] | undefined | null,
	/** fetch data from the table: "film_list" */
	film_list: Array<GraphQLTypes["film_list"]>,
	/** fetch aggregated fields from the table: "film_list" */
	film_list_aggregate: GraphQLTypes["film_list_aggregate"],
	/** fetch data from the table: "inventory" */
	inventory: Array<GraphQLTypes["inventory"]>,
	/** fetch aggregated fields from the table: "inventory" */
	inventory_aggregate: GraphQLTypes["inventory_aggregate"],
	/** fetch data from the table: "inventory" using primary key columns */
	inventory_by_pk?: GraphQLTypes["inventory"] | undefined | null,
	/** fetch data from the table: "language" */
	language: Array<GraphQLTypes["language"]>,
	/** fetch aggregated fields from the table: "language" */
	language_aggregate: GraphQLTypes["language_aggregate"],
	/** fetch data from the table: "language" using primary key columns */
	language_by_pk?: GraphQLTypes["language"] | undefined | null,
	/** fetch data from the table: "nicer_but_slower_film_list" */
	nicer_but_slower_film_list: Array<GraphQLTypes["nicer_but_slower_film_list"]>,
	/** fetch aggregated fields from the table: "nicer_but_slower_film_list" */
	nicer_but_slower_film_list_aggregate: GraphQLTypes["nicer_but_slower_film_list_aggregate"],
	/** fetch data from the table: "payment" */
	payment: Array<GraphQLTypes["payment"]>,
	/** fetch aggregated fields from the table: "payment" */
	payment_aggregate: GraphQLTypes["payment_aggregate"],
	/** fetch data from the table: "payment" using primary key columns */
	payment_by_pk?: GraphQLTypes["payment"] | undefined | null,
	/** fetch data from the table: "rental" */
	rental: Array<GraphQLTypes["rental"]>,
	/** fetch aggregated fields from the table: "rental" */
	rental_aggregate: GraphQLTypes["rental_aggregate"],
	/** fetch data from the table: "rental" using primary key columns */
	rental_by_pk?: GraphQLTypes["rental"] | undefined | null,
	/** fetch data from the table: "sales_by_film_category" */
	sales_by_film_category: Array<GraphQLTypes["sales_by_film_category"]>,
	/** fetch aggregated fields from the table: "sales_by_film_category" */
	sales_by_film_category_aggregate: GraphQLTypes["sales_by_film_category_aggregate"],
	/** fetch data from the table: "sales_by_store" */
	sales_by_store: Array<GraphQLTypes["sales_by_store"]>,
	/** fetch aggregated fields from the table: "sales_by_store" */
	sales_by_store_aggregate: GraphQLTypes["sales_by_store_aggregate"],
	/** fetch data from the table: "staff" */
	staff: Array<GraphQLTypes["staff"]>,
	/** fetch aggregated fields from the table: "staff" */
	staff_aggregate: GraphQLTypes["staff_aggregate"],
	/** fetch data from the table: "staff" using primary key columns */
	staff_by_pk?: GraphQLTypes["staff"] | undefined | null,
	/** fetch data from the table: "staff_list" */
	staff_list: Array<GraphQLTypes["staff_list"]>,
	/** fetch aggregated fields from the table: "staff_list" */
	staff_list_aggregate: GraphQLTypes["staff_list_aggregate"],
	/** fetch data from the table: "store" */
	store: Array<GraphQLTypes["store"]>,
	/** fetch aggregated fields from the table: "store" */
	store_aggregate: GraphQLTypes["store_aggregate"],
	/** fetch data from the table: "store" using primary key columns */
	store_by_pk?: GraphQLTypes["store"] | undefined | null
};
	/** columns and relationships of "rental" */
["rental"]: {
	__typename: "rental",
	customer_id: GraphQLTypes["smallint"],
	inventory_id: number,
	last_update: GraphQLTypes["timestamp"],
	rental_date: GraphQLTypes["timestamp"],
	rental_id: number,
	return_date?: GraphQLTypes["timestamp"] | undefined | null,
	staff_id: GraphQLTypes["smallint"]
};
	/** aggregated selection of "rental" */
["rental_aggregate"]: {
	__typename: "rental_aggregate",
	aggregate?: GraphQLTypes["rental_aggregate_fields"] | undefined | null,
	nodes: Array<GraphQLTypes["rental"]>
};
	/** aggregate fields of "rental" */
["rental_aggregate_fields"]: {
	__typename: "rental_aggregate_fields",
	avg?: GraphQLTypes["rental_avg_fields"] | undefined | null,
	count: number,
	max?: GraphQLTypes["rental_max_fields"] | undefined | null,
	min?: GraphQLTypes["rental_min_fields"] | undefined | null,
	stddev?: GraphQLTypes["rental_stddev_fields"] | undefined | null,
	stddev_pop?: GraphQLTypes["rental_stddev_pop_fields"] | undefined | null,
	stddev_samp?: GraphQLTypes["rental_stddev_samp_fields"] | undefined | null,
	sum?: GraphQLTypes["rental_sum_fields"] | undefined | null,
	var_pop?: GraphQLTypes["rental_var_pop_fields"] | undefined | null,
	var_samp?: GraphQLTypes["rental_var_samp_fields"] | undefined | null,
	variance?: GraphQLTypes["rental_variance_fields"] | undefined | null
};
	/** aggregate avg on columns */
["rental_avg_fields"]: {
	__typename: "rental_avg_fields",
	customer_id?: number | undefined | null,
	inventory_id?: number | undefined | null,
	rental_id?: number | undefined | null,
	staff_id?: number | undefined | null
};
	/** Boolean expression to filter rows from the table "rental". All fields are combined with a logical 'AND'. */
["rental_bool_exp"]: {
		_and?: Array<GraphQLTypes["rental_bool_exp"]> | undefined | null,
	_not?: GraphQLTypes["rental_bool_exp"] | undefined | null,
	_or?: Array<GraphQLTypes["rental_bool_exp"]> | undefined | null,
	customer_id?: GraphQLTypes["smallint_comparison_exp"] | undefined | null,
	inventory_id?: GraphQLTypes["Int_comparison_exp"] | undefined | null,
	last_update?: GraphQLTypes["timestamp_comparison_exp"] | undefined | null,
	rental_date?: GraphQLTypes["timestamp_comparison_exp"] | undefined | null,
	rental_id?: GraphQLTypes["Int_comparison_exp"] | undefined | null,
	return_date?: GraphQLTypes["timestamp_comparison_exp"] | undefined | null,
	staff_id?: GraphQLTypes["smallint_comparison_exp"] | undefined | null
};
	/** unique or primary key constraints on table "rental" */
["rental_constraint"]: rental_constraint;
	/** input type for incrementing numeric columns in table "rental" */
["rental_inc_input"]: {
		customer_id?: GraphQLTypes["smallint"] | undefined | null,
	inventory_id?: number | undefined | null,
	rental_id?: number | undefined | null,
	staff_id?: GraphQLTypes["smallint"] | undefined | null
};
	/** input type for inserting data into table "rental" */
["rental_insert_input"]: {
		customer_id?: GraphQLTypes["smallint"] | undefined | null,
	inventory_id?: number | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null,
	rental_date?: GraphQLTypes["timestamp"] | undefined | null,
	rental_id?: number | undefined | null,
	return_date?: GraphQLTypes["timestamp"] | undefined | null,
	staff_id?: GraphQLTypes["smallint"] | undefined | null
};
	/** aggregate max on columns */
["rental_max_fields"]: {
	__typename: "rental_max_fields",
	customer_id?: GraphQLTypes["smallint"] | undefined | null,
	inventory_id?: number | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null,
	rental_date?: GraphQLTypes["timestamp"] | undefined | null,
	rental_id?: number | undefined | null,
	return_date?: GraphQLTypes["timestamp"] | undefined | null,
	staff_id?: GraphQLTypes["smallint"] | undefined | null
};
	/** aggregate min on columns */
["rental_min_fields"]: {
	__typename: "rental_min_fields",
	customer_id?: GraphQLTypes["smallint"] | undefined | null,
	inventory_id?: number | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null,
	rental_date?: GraphQLTypes["timestamp"] | undefined | null,
	rental_id?: number | undefined | null,
	return_date?: GraphQLTypes["timestamp"] | undefined | null,
	staff_id?: GraphQLTypes["smallint"] | undefined | null
};
	/** response of any mutation on the table "rental" */
["rental_mutation_response"]: {
	__typename: "rental_mutation_response",
	/** number of rows affected by the mutation */
	affected_rows: number,
	/** data from the rows affected by the mutation */
	returning: Array<GraphQLTypes["rental"]>
};
	/** on_conflict condition type for table "rental" */
["rental_on_conflict"]: {
		constraint: GraphQLTypes["rental_constraint"],
	update_columns: Array<GraphQLTypes["rental_update_column"]>,
	where?: GraphQLTypes["rental_bool_exp"] | undefined | null
};
	/** Ordering options when selecting data from "rental". */
["rental_order_by"]: {
		customer_id?: GraphQLTypes["order_by"] | undefined | null,
	inventory_id?: GraphQLTypes["order_by"] | undefined | null,
	last_update?: GraphQLTypes["order_by"] | undefined | null,
	rental_date?: GraphQLTypes["order_by"] | undefined | null,
	rental_id?: GraphQLTypes["order_by"] | undefined | null,
	return_date?: GraphQLTypes["order_by"] | undefined | null,
	staff_id?: GraphQLTypes["order_by"] | undefined | null
};
	/** primary key columns input for table: rental */
["rental_pk_columns_input"]: {
		rental_id: number
};
	/** select columns of table "rental" */
["rental_select_column"]: rental_select_column;
	/** input type for updating data in table "rental" */
["rental_set_input"]: {
		customer_id?: GraphQLTypes["smallint"] | undefined | null,
	inventory_id?: number | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null,
	rental_date?: GraphQLTypes["timestamp"] | undefined | null,
	rental_id?: number | undefined | null,
	return_date?: GraphQLTypes["timestamp"] | undefined | null,
	staff_id?: GraphQLTypes["smallint"] | undefined | null
};
	/** aggregate stddev on columns */
["rental_stddev_fields"]: {
	__typename: "rental_stddev_fields",
	customer_id?: number | undefined | null,
	inventory_id?: number | undefined | null,
	rental_id?: number | undefined | null,
	staff_id?: number | undefined | null
};
	/** aggregate stddev_pop on columns */
["rental_stddev_pop_fields"]: {
	__typename: "rental_stddev_pop_fields",
	customer_id?: number | undefined | null,
	inventory_id?: number | undefined | null,
	rental_id?: number | undefined | null,
	staff_id?: number | undefined | null
};
	/** aggregate stddev_samp on columns */
["rental_stddev_samp_fields"]: {
	__typename: "rental_stddev_samp_fields",
	customer_id?: number | undefined | null,
	inventory_id?: number | undefined | null,
	rental_id?: number | undefined | null,
	staff_id?: number | undefined | null
};
	/** Streaming cursor of the table "rental" */
["rental_stream_cursor_input"]: {
		/** Stream column input with initial value */
	initial_value: GraphQLTypes["rental_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: GraphQLTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["rental_stream_cursor_value_input"]: {
		customer_id?: GraphQLTypes["smallint"] | undefined | null,
	inventory_id?: number | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null,
	rental_date?: GraphQLTypes["timestamp"] | undefined | null,
	rental_id?: number | undefined | null,
	return_date?: GraphQLTypes["timestamp"] | undefined | null,
	staff_id?: GraphQLTypes["smallint"] | undefined | null
};
	/** aggregate sum on columns */
["rental_sum_fields"]: {
	__typename: "rental_sum_fields",
	customer_id?: GraphQLTypes["smallint"] | undefined | null,
	inventory_id?: number | undefined | null,
	rental_id?: number | undefined | null,
	staff_id?: GraphQLTypes["smallint"] | undefined | null
};
	/** update columns of table "rental" */
["rental_update_column"]: rental_update_column;
	["rental_updates"]: {
		/** increments the numeric columns with given value of the filtered values */
	_inc?: GraphQLTypes["rental_inc_input"] | undefined | null,
	/** sets the columns of the filtered rows to the given values */
	_set?: GraphQLTypes["rental_set_input"] | undefined | null,
	/** filter the rows which have to be updated */
	where: GraphQLTypes["rental_bool_exp"]
};
	/** aggregate var_pop on columns */
["rental_var_pop_fields"]: {
	__typename: "rental_var_pop_fields",
	customer_id?: number | undefined | null,
	inventory_id?: number | undefined | null,
	rental_id?: number | undefined | null,
	staff_id?: number | undefined | null
};
	/** aggregate var_samp on columns */
["rental_var_samp_fields"]: {
	__typename: "rental_var_samp_fields",
	customer_id?: number | undefined | null,
	inventory_id?: number | undefined | null,
	rental_id?: number | undefined | null,
	staff_id?: number | undefined | null
};
	/** aggregate variance on columns */
["rental_variance_fields"]: {
	__typename: "rental_variance_fields",
	customer_id?: number | undefined | null,
	inventory_id?: number | undefined | null,
	rental_id?: number | undefined | null,
	staff_id?: number | undefined | null
};
	/** columns and relationships of "sales_by_film_category" */
["sales_by_film_category"]: {
	__typename: "sales_by_film_category",
	category?: string | undefined | null,
	total_sales?: GraphQLTypes["numeric"] | undefined | null
};
	/** aggregated selection of "sales_by_film_category" */
["sales_by_film_category_aggregate"]: {
	__typename: "sales_by_film_category_aggregate",
	aggregate?: GraphQLTypes["sales_by_film_category_aggregate_fields"] | undefined | null,
	nodes: Array<GraphQLTypes["sales_by_film_category"]>
};
	/** aggregate fields of "sales_by_film_category" */
["sales_by_film_category_aggregate_fields"]: {
	__typename: "sales_by_film_category_aggregate_fields",
	avg?: GraphQLTypes["sales_by_film_category_avg_fields"] | undefined | null,
	count: number,
	max?: GraphQLTypes["sales_by_film_category_max_fields"] | undefined | null,
	min?: GraphQLTypes["sales_by_film_category_min_fields"] | undefined | null,
	stddev?: GraphQLTypes["sales_by_film_category_stddev_fields"] | undefined | null,
	stddev_pop?: GraphQLTypes["sales_by_film_category_stddev_pop_fields"] | undefined | null,
	stddev_samp?: GraphQLTypes["sales_by_film_category_stddev_samp_fields"] | undefined | null,
	sum?: GraphQLTypes["sales_by_film_category_sum_fields"] | undefined | null,
	var_pop?: GraphQLTypes["sales_by_film_category_var_pop_fields"] | undefined | null,
	var_samp?: GraphQLTypes["sales_by_film_category_var_samp_fields"] | undefined | null,
	variance?: GraphQLTypes["sales_by_film_category_variance_fields"] | undefined | null
};
	/** aggregate avg on columns */
["sales_by_film_category_avg_fields"]: {
	__typename: "sales_by_film_category_avg_fields",
	total_sales?: number | undefined | null
};
	/** Boolean expression to filter rows from the table "sales_by_film_category". All fields are combined with a logical 'AND'. */
["sales_by_film_category_bool_exp"]: {
		_and?: Array<GraphQLTypes["sales_by_film_category_bool_exp"]> | undefined | null,
	_not?: GraphQLTypes["sales_by_film_category_bool_exp"] | undefined | null,
	_or?: Array<GraphQLTypes["sales_by_film_category_bool_exp"]> | undefined | null,
	category?: GraphQLTypes["String_comparison_exp"] | undefined | null,
	total_sales?: GraphQLTypes["numeric_comparison_exp"] | undefined | null
};
	/** aggregate max on columns */
["sales_by_film_category_max_fields"]: {
	__typename: "sales_by_film_category_max_fields",
	category?: string | undefined | null,
	total_sales?: GraphQLTypes["numeric"] | undefined | null
};
	/** aggregate min on columns */
["sales_by_film_category_min_fields"]: {
	__typename: "sales_by_film_category_min_fields",
	category?: string | undefined | null,
	total_sales?: GraphQLTypes["numeric"] | undefined | null
};
	/** Ordering options when selecting data from "sales_by_film_category". */
["sales_by_film_category_order_by"]: {
		category?: GraphQLTypes["order_by"] | undefined | null,
	total_sales?: GraphQLTypes["order_by"] | undefined | null
};
	/** select columns of table "sales_by_film_category" */
["sales_by_film_category_select_column"]: sales_by_film_category_select_column;
	/** aggregate stddev on columns */
["sales_by_film_category_stddev_fields"]: {
	__typename: "sales_by_film_category_stddev_fields",
	total_sales?: number | undefined | null
};
	/** aggregate stddev_pop on columns */
["sales_by_film_category_stddev_pop_fields"]: {
	__typename: "sales_by_film_category_stddev_pop_fields",
	total_sales?: number | undefined | null
};
	/** aggregate stddev_samp on columns */
["sales_by_film_category_stddev_samp_fields"]: {
	__typename: "sales_by_film_category_stddev_samp_fields",
	total_sales?: number | undefined | null
};
	/** Streaming cursor of the table "sales_by_film_category" */
["sales_by_film_category_stream_cursor_input"]: {
		/** Stream column input with initial value */
	initial_value: GraphQLTypes["sales_by_film_category_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: GraphQLTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["sales_by_film_category_stream_cursor_value_input"]: {
		category?: string | undefined | null,
	total_sales?: GraphQLTypes["numeric"] | undefined | null
};
	/** aggregate sum on columns */
["sales_by_film_category_sum_fields"]: {
	__typename: "sales_by_film_category_sum_fields",
	total_sales?: GraphQLTypes["numeric"] | undefined | null
};
	/** aggregate var_pop on columns */
["sales_by_film_category_var_pop_fields"]: {
	__typename: "sales_by_film_category_var_pop_fields",
	total_sales?: number | undefined | null
};
	/** aggregate var_samp on columns */
["sales_by_film_category_var_samp_fields"]: {
	__typename: "sales_by_film_category_var_samp_fields",
	total_sales?: number | undefined | null
};
	/** aggregate variance on columns */
["sales_by_film_category_variance_fields"]: {
	__typename: "sales_by_film_category_variance_fields",
	total_sales?: number | undefined | null
};
	/** columns and relationships of "sales_by_store" */
["sales_by_store"]: {
	__typename: "sales_by_store",
	manager?: string | undefined | null,
	store?: string | undefined | null,
	total_sales?: GraphQLTypes["numeric"] | undefined | null
};
	/** aggregated selection of "sales_by_store" */
["sales_by_store_aggregate"]: {
	__typename: "sales_by_store_aggregate",
	aggregate?: GraphQLTypes["sales_by_store_aggregate_fields"] | undefined | null,
	nodes: Array<GraphQLTypes["sales_by_store"]>
};
	/** aggregate fields of "sales_by_store" */
["sales_by_store_aggregate_fields"]: {
	__typename: "sales_by_store_aggregate_fields",
	avg?: GraphQLTypes["sales_by_store_avg_fields"] | undefined | null,
	count: number,
	max?: GraphQLTypes["sales_by_store_max_fields"] | undefined | null,
	min?: GraphQLTypes["sales_by_store_min_fields"] | undefined | null,
	stddev?: GraphQLTypes["sales_by_store_stddev_fields"] | undefined | null,
	stddev_pop?: GraphQLTypes["sales_by_store_stddev_pop_fields"] | undefined | null,
	stddev_samp?: GraphQLTypes["sales_by_store_stddev_samp_fields"] | undefined | null,
	sum?: GraphQLTypes["sales_by_store_sum_fields"] | undefined | null,
	var_pop?: GraphQLTypes["sales_by_store_var_pop_fields"] | undefined | null,
	var_samp?: GraphQLTypes["sales_by_store_var_samp_fields"] | undefined | null,
	variance?: GraphQLTypes["sales_by_store_variance_fields"] | undefined | null
};
	/** aggregate avg on columns */
["sales_by_store_avg_fields"]: {
	__typename: "sales_by_store_avg_fields",
	total_sales?: number | undefined | null
};
	/** Boolean expression to filter rows from the table "sales_by_store". All fields are combined with a logical 'AND'. */
["sales_by_store_bool_exp"]: {
		_and?: Array<GraphQLTypes["sales_by_store_bool_exp"]> | undefined | null,
	_not?: GraphQLTypes["sales_by_store_bool_exp"] | undefined | null,
	_or?: Array<GraphQLTypes["sales_by_store_bool_exp"]> | undefined | null,
	manager?: GraphQLTypes["String_comparison_exp"] | undefined | null,
	store?: GraphQLTypes["String_comparison_exp"] | undefined | null,
	total_sales?: GraphQLTypes["numeric_comparison_exp"] | undefined | null
};
	/** aggregate max on columns */
["sales_by_store_max_fields"]: {
	__typename: "sales_by_store_max_fields",
	manager?: string | undefined | null,
	store?: string | undefined | null,
	total_sales?: GraphQLTypes["numeric"] | undefined | null
};
	/** aggregate min on columns */
["sales_by_store_min_fields"]: {
	__typename: "sales_by_store_min_fields",
	manager?: string | undefined | null,
	store?: string | undefined | null,
	total_sales?: GraphQLTypes["numeric"] | undefined | null
};
	/** Ordering options when selecting data from "sales_by_store". */
["sales_by_store_order_by"]: {
		manager?: GraphQLTypes["order_by"] | undefined | null,
	store?: GraphQLTypes["order_by"] | undefined | null,
	total_sales?: GraphQLTypes["order_by"] | undefined | null
};
	/** select columns of table "sales_by_store" */
["sales_by_store_select_column"]: sales_by_store_select_column;
	/** aggregate stddev on columns */
["sales_by_store_stddev_fields"]: {
	__typename: "sales_by_store_stddev_fields",
	total_sales?: number | undefined | null
};
	/** aggregate stddev_pop on columns */
["sales_by_store_stddev_pop_fields"]: {
	__typename: "sales_by_store_stddev_pop_fields",
	total_sales?: number | undefined | null
};
	/** aggregate stddev_samp on columns */
["sales_by_store_stddev_samp_fields"]: {
	__typename: "sales_by_store_stddev_samp_fields",
	total_sales?: number | undefined | null
};
	/** Streaming cursor of the table "sales_by_store" */
["sales_by_store_stream_cursor_input"]: {
		/** Stream column input with initial value */
	initial_value: GraphQLTypes["sales_by_store_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: GraphQLTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["sales_by_store_stream_cursor_value_input"]: {
		manager?: string | undefined | null,
	store?: string | undefined | null,
	total_sales?: GraphQLTypes["numeric"] | undefined | null
};
	/** aggregate sum on columns */
["sales_by_store_sum_fields"]: {
	__typename: "sales_by_store_sum_fields",
	total_sales?: GraphQLTypes["numeric"] | undefined | null
};
	/** aggregate var_pop on columns */
["sales_by_store_var_pop_fields"]: {
	__typename: "sales_by_store_var_pop_fields",
	total_sales?: number | undefined | null
};
	/** aggregate var_samp on columns */
["sales_by_store_var_samp_fields"]: {
	__typename: "sales_by_store_var_samp_fields",
	total_sales?: number | undefined | null
};
	/** aggregate variance on columns */
["sales_by_store_variance_fields"]: {
	__typename: "sales_by_store_variance_fields",
	total_sales?: number | undefined | null
};
	["smallint"]: "scalar" & { name: "smallint" };
	/** Boolean expression to compare columns of type "smallint". All fields are combined with logical 'AND'. */
["smallint_comparison_exp"]: {
		_eq?: GraphQLTypes["smallint"] | undefined | null,
	_gt?: GraphQLTypes["smallint"] | undefined | null,
	_gte?: GraphQLTypes["smallint"] | undefined | null,
	_in?: Array<GraphQLTypes["smallint"]> | undefined | null,
	_is_null?: boolean | undefined | null,
	_lt?: GraphQLTypes["smallint"] | undefined | null,
	_lte?: GraphQLTypes["smallint"] | undefined | null,
	_neq?: GraphQLTypes["smallint"] | undefined | null,
	_nin?: Array<GraphQLTypes["smallint"]> | undefined | null
};
	/** columns and relationships of "staff" */
["staff"]: {
	__typename: "staff",
	active: boolean,
	address_id: GraphQLTypes["smallint"],
	email?: string | undefined | null,
	first_name: string,
	last_name: string,
	last_update: GraphQLTypes["timestamp"],
	password?: string | undefined | null,
	picture?: GraphQLTypes["bytea"] | undefined | null,
	staff_id: number,
	store_id: GraphQLTypes["smallint"],
	username: string
};
	/** aggregated selection of "staff" */
["staff_aggregate"]: {
	__typename: "staff_aggregate",
	aggregate?: GraphQLTypes["staff_aggregate_fields"] | undefined | null,
	nodes: Array<GraphQLTypes["staff"]>
};
	/** aggregate fields of "staff" */
["staff_aggregate_fields"]: {
	__typename: "staff_aggregate_fields",
	avg?: GraphQLTypes["staff_avg_fields"] | undefined | null,
	count: number,
	max?: GraphQLTypes["staff_max_fields"] | undefined | null,
	min?: GraphQLTypes["staff_min_fields"] | undefined | null,
	stddev?: GraphQLTypes["staff_stddev_fields"] | undefined | null,
	stddev_pop?: GraphQLTypes["staff_stddev_pop_fields"] | undefined | null,
	stddev_samp?: GraphQLTypes["staff_stddev_samp_fields"] | undefined | null,
	sum?: GraphQLTypes["staff_sum_fields"] | undefined | null,
	var_pop?: GraphQLTypes["staff_var_pop_fields"] | undefined | null,
	var_samp?: GraphQLTypes["staff_var_samp_fields"] | undefined | null,
	variance?: GraphQLTypes["staff_variance_fields"] | undefined | null
};
	/** aggregate avg on columns */
["staff_avg_fields"]: {
	__typename: "staff_avg_fields",
	address_id?: number | undefined | null,
	staff_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	/** Boolean expression to filter rows from the table "staff". All fields are combined with a logical 'AND'. */
["staff_bool_exp"]: {
		_and?: Array<GraphQLTypes["staff_bool_exp"]> | undefined | null,
	_not?: GraphQLTypes["staff_bool_exp"] | undefined | null,
	_or?: Array<GraphQLTypes["staff_bool_exp"]> | undefined | null,
	active?: GraphQLTypes["Boolean_comparison_exp"] | undefined | null,
	address_id?: GraphQLTypes["smallint_comparison_exp"] | undefined | null,
	email?: GraphQLTypes["String_comparison_exp"] | undefined | null,
	first_name?: GraphQLTypes["String_comparison_exp"] | undefined | null,
	last_name?: GraphQLTypes["String_comparison_exp"] | undefined | null,
	last_update?: GraphQLTypes["timestamp_comparison_exp"] | undefined | null,
	password?: GraphQLTypes["String_comparison_exp"] | undefined | null,
	picture?: GraphQLTypes["bytea_comparison_exp"] | undefined | null,
	staff_id?: GraphQLTypes["Int_comparison_exp"] | undefined | null,
	store_id?: GraphQLTypes["smallint_comparison_exp"] | undefined | null,
	username?: GraphQLTypes["String_comparison_exp"] | undefined | null
};
	/** unique or primary key constraints on table "staff" */
["staff_constraint"]: staff_constraint;
	/** input type for incrementing numeric columns in table "staff" */
["staff_inc_input"]: {
		address_id?: GraphQLTypes["smallint"] | undefined | null,
	staff_id?: number | undefined | null,
	store_id?: GraphQLTypes["smallint"] | undefined | null
};
	/** input type for inserting data into table "staff" */
["staff_insert_input"]: {
		active?: boolean | undefined | null,
	address_id?: GraphQLTypes["smallint"] | undefined | null,
	email?: string | undefined | null,
	first_name?: string | undefined | null,
	last_name?: string | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null,
	password?: string | undefined | null,
	picture?: GraphQLTypes["bytea"] | undefined | null,
	staff_id?: number | undefined | null,
	store_id?: GraphQLTypes["smallint"] | undefined | null,
	username?: string | undefined | null
};
	/** columns and relationships of "staff_list" */
["staff_list"]: {
	__typename: "staff_list",
	address?: string | undefined | null,
	city?: string | undefined | null,
	country?: string | undefined | null,
	id?: number | undefined | null,
	name?: string | undefined | null,
	phone?: string | undefined | null,
	sid?: GraphQLTypes["smallint"] | undefined | null,
	zip_code?: string | undefined | null
};
	/** aggregated selection of "staff_list" */
["staff_list_aggregate"]: {
	__typename: "staff_list_aggregate",
	aggregate?: GraphQLTypes["staff_list_aggregate_fields"] | undefined | null,
	nodes: Array<GraphQLTypes["staff_list"]>
};
	/** aggregate fields of "staff_list" */
["staff_list_aggregate_fields"]: {
	__typename: "staff_list_aggregate_fields",
	avg?: GraphQLTypes["staff_list_avg_fields"] | undefined | null,
	count: number,
	max?: GraphQLTypes["staff_list_max_fields"] | undefined | null,
	min?: GraphQLTypes["staff_list_min_fields"] | undefined | null,
	stddev?: GraphQLTypes["staff_list_stddev_fields"] | undefined | null,
	stddev_pop?: GraphQLTypes["staff_list_stddev_pop_fields"] | undefined | null,
	stddev_samp?: GraphQLTypes["staff_list_stddev_samp_fields"] | undefined | null,
	sum?: GraphQLTypes["staff_list_sum_fields"] | undefined | null,
	var_pop?: GraphQLTypes["staff_list_var_pop_fields"] | undefined | null,
	var_samp?: GraphQLTypes["staff_list_var_samp_fields"] | undefined | null,
	variance?: GraphQLTypes["staff_list_variance_fields"] | undefined | null
};
	/** aggregate avg on columns */
["staff_list_avg_fields"]: {
	__typename: "staff_list_avg_fields",
	id?: number | undefined | null,
	sid?: number | undefined | null
};
	/** Boolean expression to filter rows from the table "staff_list". All fields are combined with a logical 'AND'. */
["staff_list_bool_exp"]: {
		_and?: Array<GraphQLTypes["staff_list_bool_exp"]> | undefined | null,
	_not?: GraphQLTypes["staff_list_bool_exp"] | undefined | null,
	_or?: Array<GraphQLTypes["staff_list_bool_exp"]> | undefined | null,
	address?: GraphQLTypes["String_comparison_exp"] | undefined | null,
	city?: GraphQLTypes["String_comparison_exp"] | undefined | null,
	country?: GraphQLTypes["String_comparison_exp"] | undefined | null,
	id?: GraphQLTypes["Int_comparison_exp"] | undefined | null,
	name?: GraphQLTypes["String_comparison_exp"] | undefined | null,
	phone?: GraphQLTypes["String_comparison_exp"] | undefined | null,
	sid?: GraphQLTypes["smallint_comparison_exp"] | undefined | null,
	zip_code?: GraphQLTypes["String_comparison_exp"] | undefined | null
};
	/** aggregate max on columns */
["staff_list_max_fields"]: {
	__typename: "staff_list_max_fields",
	address?: string | undefined | null,
	city?: string | undefined | null,
	country?: string | undefined | null,
	id?: number | undefined | null,
	name?: string | undefined | null,
	phone?: string | undefined | null,
	sid?: GraphQLTypes["smallint"] | undefined | null,
	zip_code?: string | undefined | null
};
	/** aggregate min on columns */
["staff_list_min_fields"]: {
	__typename: "staff_list_min_fields",
	address?: string | undefined | null,
	city?: string | undefined | null,
	country?: string | undefined | null,
	id?: number | undefined | null,
	name?: string | undefined | null,
	phone?: string | undefined | null,
	sid?: GraphQLTypes["smallint"] | undefined | null,
	zip_code?: string | undefined | null
};
	/** Ordering options when selecting data from "staff_list". */
["staff_list_order_by"]: {
		address?: GraphQLTypes["order_by"] | undefined | null,
	city?: GraphQLTypes["order_by"] | undefined | null,
	country?: GraphQLTypes["order_by"] | undefined | null,
	id?: GraphQLTypes["order_by"] | undefined | null,
	name?: GraphQLTypes["order_by"] | undefined | null,
	phone?: GraphQLTypes["order_by"] | undefined | null,
	sid?: GraphQLTypes["order_by"] | undefined | null,
	zip_code?: GraphQLTypes["order_by"] | undefined | null
};
	/** select columns of table "staff_list" */
["staff_list_select_column"]: staff_list_select_column;
	/** aggregate stddev on columns */
["staff_list_stddev_fields"]: {
	__typename: "staff_list_stddev_fields",
	id?: number | undefined | null,
	sid?: number | undefined | null
};
	/** aggregate stddev_pop on columns */
["staff_list_stddev_pop_fields"]: {
	__typename: "staff_list_stddev_pop_fields",
	id?: number | undefined | null,
	sid?: number | undefined | null
};
	/** aggregate stddev_samp on columns */
["staff_list_stddev_samp_fields"]: {
	__typename: "staff_list_stddev_samp_fields",
	id?: number | undefined | null,
	sid?: number | undefined | null
};
	/** Streaming cursor of the table "staff_list" */
["staff_list_stream_cursor_input"]: {
		/** Stream column input with initial value */
	initial_value: GraphQLTypes["staff_list_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: GraphQLTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["staff_list_stream_cursor_value_input"]: {
		address?: string | undefined | null,
	city?: string | undefined | null,
	country?: string | undefined | null,
	id?: number | undefined | null,
	name?: string | undefined | null,
	phone?: string | undefined | null,
	sid?: GraphQLTypes["smallint"] | undefined | null,
	zip_code?: string | undefined | null
};
	/** aggregate sum on columns */
["staff_list_sum_fields"]: {
	__typename: "staff_list_sum_fields",
	id?: number | undefined | null,
	sid?: GraphQLTypes["smallint"] | undefined | null
};
	/** aggregate var_pop on columns */
["staff_list_var_pop_fields"]: {
	__typename: "staff_list_var_pop_fields",
	id?: number | undefined | null,
	sid?: number | undefined | null
};
	/** aggregate var_samp on columns */
["staff_list_var_samp_fields"]: {
	__typename: "staff_list_var_samp_fields",
	id?: number | undefined | null,
	sid?: number | undefined | null
};
	/** aggregate variance on columns */
["staff_list_variance_fields"]: {
	__typename: "staff_list_variance_fields",
	id?: number | undefined | null,
	sid?: number | undefined | null
};
	/** aggregate max on columns */
["staff_max_fields"]: {
	__typename: "staff_max_fields",
	address_id?: GraphQLTypes["smallint"] | undefined | null,
	email?: string | undefined | null,
	first_name?: string | undefined | null,
	last_name?: string | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null,
	password?: string | undefined | null,
	staff_id?: number | undefined | null,
	store_id?: GraphQLTypes["smallint"] | undefined | null,
	username?: string | undefined | null
};
	/** aggregate min on columns */
["staff_min_fields"]: {
	__typename: "staff_min_fields",
	address_id?: GraphQLTypes["smallint"] | undefined | null,
	email?: string | undefined | null,
	first_name?: string | undefined | null,
	last_name?: string | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null,
	password?: string | undefined | null,
	staff_id?: number | undefined | null,
	store_id?: GraphQLTypes["smallint"] | undefined | null,
	username?: string | undefined | null
};
	/** response of any mutation on the table "staff" */
["staff_mutation_response"]: {
	__typename: "staff_mutation_response",
	/** number of rows affected by the mutation */
	affected_rows: number,
	/** data from the rows affected by the mutation */
	returning: Array<GraphQLTypes["staff"]>
};
	/** on_conflict condition type for table "staff" */
["staff_on_conflict"]: {
		constraint: GraphQLTypes["staff_constraint"],
	update_columns: Array<GraphQLTypes["staff_update_column"]>,
	where?: GraphQLTypes["staff_bool_exp"] | undefined | null
};
	/** Ordering options when selecting data from "staff". */
["staff_order_by"]: {
		active?: GraphQLTypes["order_by"] | undefined | null,
	address_id?: GraphQLTypes["order_by"] | undefined | null,
	email?: GraphQLTypes["order_by"] | undefined | null,
	first_name?: GraphQLTypes["order_by"] | undefined | null,
	last_name?: GraphQLTypes["order_by"] | undefined | null,
	last_update?: GraphQLTypes["order_by"] | undefined | null,
	password?: GraphQLTypes["order_by"] | undefined | null,
	picture?: GraphQLTypes["order_by"] | undefined | null,
	staff_id?: GraphQLTypes["order_by"] | undefined | null,
	store_id?: GraphQLTypes["order_by"] | undefined | null,
	username?: GraphQLTypes["order_by"] | undefined | null
};
	/** primary key columns input for table: staff */
["staff_pk_columns_input"]: {
		staff_id: number
};
	/** select columns of table "staff" */
["staff_select_column"]: staff_select_column;
	/** input type for updating data in table "staff" */
["staff_set_input"]: {
		active?: boolean | undefined | null,
	address_id?: GraphQLTypes["smallint"] | undefined | null,
	email?: string | undefined | null,
	first_name?: string | undefined | null,
	last_name?: string | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null,
	password?: string | undefined | null,
	picture?: GraphQLTypes["bytea"] | undefined | null,
	staff_id?: number | undefined | null,
	store_id?: GraphQLTypes["smallint"] | undefined | null,
	username?: string | undefined | null
};
	/** aggregate stddev on columns */
["staff_stddev_fields"]: {
	__typename: "staff_stddev_fields",
	address_id?: number | undefined | null,
	staff_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	/** aggregate stddev_pop on columns */
["staff_stddev_pop_fields"]: {
	__typename: "staff_stddev_pop_fields",
	address_id?: number | undefined | null,
	staff_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	/** aggregate stddev_samp on columns */
["staff_stddev_samp_fields"]: {
	__typename: "staff_stddev_samp_fields",
	address_id?: number | undefined | null,
	staff_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	/** Streaming cursor of the table "staff" */
["staff_stream_cursor_input"]: {
		/** Stream column input with initial value */
	initial_value: GraphQLTypes["staff_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: GraphQLTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["staff_stream_cursor_value_input"]: {
		active?: boolean | undefined | null,
	address_id?: GraphQLTypes["smallint"] | undefined | null,
	email?: string | undefined | null,
	first_name?: string | undefined | null,
	last_name?: string | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null,
	password?: string | undefined | null,
	picture?: GraphQLTypes["bytea"] | undefined | null,
	staff_id?: number | undefined | null,
	store_id?: GraphQLTypes["smallint"] | undefined | null,
	username?: string | undefined | null
};
	/** aggregate sum on columns */
["staff_sum_fields"]: {
	__typename: "staff_sum_fields",
	address_id?: GraphQLTypes["smallint"] | undefined | null,
	staff_id?: number | undefined | null,
	store_id?: GraphQLTypes["smallint"] | undefined | null
};
	/** update columns of table "staff" */
["staff_update_column"]: staff_update_column;
	["staff_updates"]: {
		/** increments the numeric columns with given value of the filtered values */
	_inc?: GraphQLTypes["staff_inc_input"] | undefined | null,
	/** sets the columns of the filtered rows to the given values */
	_set?: GraphQLTypes["staff_set_input"] | undefined | null,
	/** filter the rows which have to be updated */
	where: GraphQLTypes["staff_bool_exp"]
};
	/** aggregate var_pop on columns */
["staff_var_pop_fields"]: {
	__typename: "staff_var_pop_fields",
	address_id?: number | undefined | null,
	staff_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	/** aggregate var_samp on columns */
["staff_var_samp_fields"]: {
	__typename: "staff_var_samp_fields",
	address_id?: number | undefined | null,
	staff_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	/** aggregate variance on columns */
["staff_variance_fields"]: {
	__typename: "staff_variance_fields",
	address_id?: number | undefined | null,
	staff_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	/** columns and relationships of "store" */
["store"]: {
	__typename: "store",
	address_id: GraphQLTypes["smallint"],
	last_update: GraphQLTypes["timestamp"],
	manager_staff_id: GraphQLTypes["smallint"],
	store_id: number
};
	/** aggregated selection of "store" */
["store_aggregate"]: {
	__typename: "store_aggregate",
	aggregate?: GraphQLTypes["store_aggregate_fields"] | undefined | null,
	nodes: Array<GraphQLTypes["store"]>
};
	/** aggregate fields of "store" */
["store_aggregate_fields"]: {
	__typename: "store_aggregate_fields",
	avg?: GraphQLTypes["store_avg_fields"] | undefined | null,
	count: number,
	max?: GraphQLTypes["store_max_fields"] | undefined | null,
	min?: GraphQLTypes["store_min_fields"] | undefined | null,
	stddev?: GraphQLTypes["store_stddev_fields"] | undefined | null,
	stddev_pop?: GraphQLTypes["store_stddev_pop_fields"] | undefined | null,
	stddev_samp?: GraphQLTypes["store_stddev_samp_fields"] | undefined | null,
	sum?: GraphQLTypes["store_sum_fields"] | undefined | null,
	var_pop?: GraphQLTypes["store_var_pop_fields"] | undefined | null,
	var_samp?: GraphQLTypes["store_var_samp_fields"] | undefined | null,
	variance?: GraphQLTypes["store_variance_fields"] | undefined | null
};
	/** aggregate avg on columns */
["store_avg_fields"]: {
	__typename: "store_avg_fields",
	address_id?: number | undefined | null,
	manager_staff_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	/** Boolean expression to filter rows from the table "store". All fields are combined with a logical 'AND'. */
["store_bool_exp"]: {
		_and?: Array<GraphQLTypes["store_bool_exp"]> | undefined | null,
	_not?: GraphQLTypes["store_bool_exp"] | undefined | null,
	_or?: Array<GraphQLTypes["store_bool_exp"]> | undefined | null,
	address_id?: GraphQLTypes["smallint_comparison_exp"] | undefined | null,
	last_update?: GraphQLTypes["timestamp_comparison_exp"] | undefined | null,
	manager_staff_id?: GraphQLTypes["smallint_comparison_exp"] | undefined | null,
	store_id?: GraphQLTypes["Int_comparison_exp"] | undefined | null
};
	/** unique or primary key constraints on table "store" */
["store_constraint"]: store_constraint;
	/** input type for incrementing numeric columns in table "store" */
["store_inc_input"]: {
		address_id?: GraphQLTypes["smallint"] | undefined | null,
	manager_staff_id?: GraphQLTypes["smallint"] | undefined | null,
	store_id?: number | undefined | null
};
	/** input type for inserting data into table "store" */
["store_insert_input"]: {
		address_id?: GraphQLTypes["smallint"] | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null,
	manager_staff_id?: GraphQLTypes["smallint"] | undefined | null,
	store_id?: number | undefined | null
};
	/** aggregate max on columns */
["store_max_fields"]: {
	__typename: "store_max_fields",
	address_id?: GraphQLTypes["smallint"] | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null,
	manager_staff_id?: GraphQLTypes["smallint"] | undefined | null,
	store_id?: number | undefined | null
};
	/** aggregate min on columns */
["store_min_fields"]: {
	__typename: "store_min_fields",
	address_id?: GraphQLTypes["smallint"] | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null,
	manager_staff_id?: GraphQLTypes["smallint"] | undefined | null,
	store_id?: number | undefined | null
};
	/** response of any mutation on the table "store" */
["store_mutation_response"]: {
	__typename: "store_mutation_response",
	/** number of rows affected by the mutation */
	affected_rows: number,
	/** data from the rows affected by the mutation */
	returning: Array<GraphQLTypes["store"]>
};
	/** on_conflict condition type for table "store" */
["store_on_conflict"]: {
		constraint: GraphQLTypes["store_constraint"],
	update_columns: Array<GraphQLTypes["store_update_column"]>,
	where?: GraphQLTypes["store_bool_exp"] | undefined | null
};
	/** Ordering options when selecting data from "store". */
["store_order_by"]: {
		address_id?: GraphQLTypes["order_by"] | undefined | null,
	last_update?: GraphQLTypes["order_by"] | undefined | null,
	manager_staff_id?: GraphQLTypes["order_by"] | undefined | null,
	store_id?: GraphQLTypes["order_by"] | undefined | null
};
	/** primary key columns input for table: store */
["store_pk_columns_input"]: {
		store_id: number
};
	/** select columns of table "store" */
["store_select_column"]: store_select_column;
	/** input type for updating data in table "store" */
["store_set_input"]: {
		address_id?: GraphQLTypes["smallint"] | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null,
	manager_staff_id?: GraphQLTypes["smallint"] | undefined | null,
	store_id?: number | undefined | null
};
	/** aggregate stddev on columns */
["store_stddev_fields"]: {
	__typename: "store_stddev_fields",
	address_id?: number | undefined | null,
	manager_staff_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	/** aggregate stddev_pop on columns */
["store_stddev_pop_fields"]: {
	__typename: "store_stddev_pop_fields",
	address_id?: number | undefined | null,
	manager_staff_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	/** aggregate stddev_samp on columns */
["store_stddev_samp_fields"]: {
	__typename: "store_stddev_samp_fields",
	address_id?: number | undefined | null,
	manager_staff_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	/** Streaming cursor of the table "store" */
["store_stream_cursor_input"]: {
		/** Stream column input with initial value */
	initial_value: GraphQLTypes["store_stream_cursor_value_input"],
	/** cursor ordering */
	ordering?: GraphQLTypes["cursor_ordering"] | undefined | null
};
	/** Initial value of the column from where the streaming should start */
["store_stream_cursor_value_input"]: {
		address_id?: GraphQLTypes["smallint"] | undefined | null,
	last_update?: GraphQLTypes["timestamp"] | undefined | null,
	manager_staff_id?: GraphQLTypes["smallint"] | undefined | null,
	store_id?: number | undefined | null
};
	/** aggregate sum on columns */
["store_sum_fields"]: {
	__typename: "store_sum_fields",
	address_id?: GraphQLTypes["smallint"] | undefined | null,
	manager_staff_id?: GraphQLTypes["smallint"] | undefined | null,
	store_id?: number | undefined | null
};
	/** update columns of table "store" */
["store_update_column"]: store_update_column;
	["store_updates"]: {
		/** increments the numeric columns with given value of the filtered values */
	_inc?: GraphQLTypes["store_inc_input"] | undefined | null,
	/** sets the columns of the filtered rows to the given values */
	_set?: GraphQLTypes["store_set_input"] | undefined | null,
	/** filter the rows which have to be updated */
	where: GraphQLTypes["store_bool_exp"]
};
	/** aggregate var_pop on columns */
["store_var_pop_fields"]: {
	__typename: "store_var_pop_fields",
	address_id?: number | undefined | null,
	manager_staff_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	/** aggregate var_samp on columns */
["store_var_samp_fields"]: {
	__typename: "store_var_samp_fields",
	address_id?: number | undefined | null,
	manager_staff_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	/** aggregate variance on columns */
["store_variance_fields"]: {
	__typename: "store_variance_fields",
	address_id?: number | undefined | null,
	manager_staff_id?: number | undefined | null,
	store_id?: number | undefined | null
};
	["subscription_root"]: {
	__typename: "subscription_root",
	/** fetch data from the table: "actor" */
	actor: Array<GraphQLTypes["actor"]>,
	/** fetch aggregated fields from the table: "actor" */
	actor_aggregate: GraphQLTypes["actor_aggregate"],
	/** fetch data from the table: "actor" using primary key columns */
	actor_by_pk?: GraphQLTypes["actor"] | undefined | null,
	/** fetch data from the table: "actor_info" */
	actor_info: Array<GraphQLTypes["actor_info"]>,
	/** fetch aggregated fields from the table: "actor_info" */
	actor_info_aggregate: GraphQLTypes["actor_info_aggregate"],
	/** fetch data from the table in a streaming manner: "actor_info" */
	actor_info_stream: Array<GraphQLTypes["actor_info"]>,
	/** fetch data from the table in a streaming manner: "actor" */
	actor_stream: Array<GraphQLTypes["actor"]>,
	/** fetch data from the table: "address" */
	address: Array<GraphQLTypes["address"]>,
	/** fetch aggregated fields from the table: "address" */
	address_aggregate: GraphQLTypes["address_aggregate"],
	/** fetch data from the table: "address" using primary key columns */
	address_by_pk?: GraphQLTypes["address"] | undefined | null,
	/** fetch data from the table in a streaming manner: "address" */
	address_stream: Array<GraphQLTypes["address"]>,
	/** fetch data from the table: "category" */
	category: Array<GraphQLTypes["category"]>,
	/** fetch aggregated fields from the table: "category" */
	category_aggregate: GraphQLTypes["category_aggregate"],
	/** fetch data from the table: "category" using primary key columns */
	category_by_pk?: GraphQLTypes["category"] | undefined | null,
	/** fetch data from the table in a streaming manner: "category" */
	category_stream: Array<GraphQLTypes["category"]>,
	/** fetch data from the table: "city" */
	city: Array<GraphQLTypes["city"]>,
	/** fetch aggregated fields from the table: "city" */
	city_aggregate: GraphQLTypes["city_aggregate"],
	/** fetch data from the table: "city" using primary key columns */
	city_by_pk?: GraphQLTypes["city"] | undefined | null,
	/** fetch data from the table in a streaming manner: "city" */
	city_stream: Array<GraphQLTypes["city"]>,
	/** fetch data from the table: "country" */
	country: Array<GraphQLTypes["country"]>,
	/** fetch aggregated fields from the table: "country" */
	country_aggregate: GraphQLTypes["country_aggregate"],
	/** fetch data from the table: "country" using primary key columns */
	country_by_pk?: GraphQLTypes["country"] | undefined | null,
	/** fetch data from the table in a streaming manner: "country" */
	country_stream: Array<GraphQLTypes["country"]>,
	/** fetch data from the table: "customer" */
	customer: Array<GraphQLTypes["customer"]>,
	/** fetch aggregated fields from the table: "customer" */
	customer_aggregate: GraphQLTypes["customer_aggregate"],
	/** fetch data from the table: "customer" using primary key columns */
	customer_by_pk?: GraphQLTypes["customer"] | undefined | null,
	/** fetch data from the table: "customer_list" */
	customer_list: Array<GraphQLTypes["customer_list"]>,
	/** fetch aggregated fields from the table: "customer_list" */
	customer_list_aggregate: GraphQLTypes["customer_list_aggregate"],
	/** fetch data from the table in a streaming manner: "customer_list" */
	customer_list_stream: Array<GraphQLTypes["customer_list"]>,
	/** fetch data from the table in a streaming manner: "customer" */
	customer_stream: Array<GraphQLTypes["customer"]>,
	/** fetch data from the table: "film" */
	film: Array<GraphQLTypes["film"]>,
	/** fetch data from the table: "film_actor" */
	film_actor: Array<GraphQLTypes["film_actor"]>,
	/** fetch aggregated fields from the table: "film_actor" */
	film_actor_aggregate: GraphQLTypes["film_actor_aggregate"],
	/** fetch data from the table: "film_actor" using primary key columns */
	film_actor_by_pk?: GraphQLTypes["film_actor"] | undefined | null,
	/** fetch data from the table in a streaming manner: "film_actor" */
	film_actor_stream: Array<GraphQLTypes["film_actor"]>,
	/** fetch aggregated fields from the table: "film" */
	film_aggregate: GraphQLTypes["film_aggregate"],
	/** fetch data from the table: "film" using primary key columns */
	film_by_pk?: GraphQLTypes["film"] | undefined | null,
	/** fetch data from the table: "film_category" */
	film_category: Array<GraphQLTypes["film_category"]>,
	/** fetch aggregated fields from the table: "film_category" */
	film_category_aggregate: GraphQLTypes["film_category_aggregate"],
	/** fetch data from the table: "film_category" using primary key columns */
	film_category_by_pk?: GraphQLTypes["film_category"] | undefined | null,
	/** fetch data from the table in a streaming manner: "film_category" */
	film_category_stream: Array<GraphQLTypes["film_category"]>,
	/** fetch data from the table: "film_list" */
	film_list: Array<GraphQLTypes["film_list"]>,
	/** fetch aggregated fields from the table: "film_list" */
	film_list_aggregate: GraphQLTypes["film_list_aggregate"],
	/** fetch data from the table in a streaming manner: "film_list" */
	film_list_stream: Array<GraphQLTypes["film_list"]>,
	/** fetch data from the table in a streaming manner: "film" */
	film_stream: Array<GraphQLTypes["film"]>,
	/** fetch data from the table: "inventory" */
	inventory: Array<GraphQLTypes["inventory"]>,
	/** fetch aggregated fields from the table: "inventory" */
	inventory_aggregate: GraphQLTypes["inventory_aggregate"],
	/** fetch data from the table: "inventory" using primary key columns */
	inventory_by_pk?: GraphQLTypes["inventory"] | undefined | null,
	/** fetch data from the table in a streaming manner: "inventory" */
	inventory_stream: Array<GraphQLTypes["inventory"]>,
	/** fetch data from the table: "language" */
	language: Array<GraphQLTypes["language"]>,
	/** fetch aggregated fields from the table: "language" */
	language_aggregate: GraphQLTypes["language_aggregate"],
	/** fetch data from the table: "language" using primary key columns */
	language_by_pk?: GraphQLTypes["language"] | undefined | null,
	/** fetch data from the table in a streaming manner: "language" */
	language_stream: Array<GraphQLTypes["language"]>,
	/** fetch data from the table: "nicer_but_slower_film_list" */
	nicer_but_slower_film_list: Array<GraphQLTypes["nicer_but_slower_film_list"]>,
	/** fetch aggregated fields from the table: "nicer_but_slower_film_list" */
	nicer_but_slower_film_list_aggregate: GraphQLTypes["nicer_but_slower_film_list_aggregate"],
	/** fetch data from the table in a streaming manner: "nicer_but_slower_film_list" */
	nicer_but_slower_film_list_stream: Array<GraphQLTypes["nicer_but_slower_film_list"]>,
	/** fetch data from the table: "payment" */
	payment: Array<GraphQLTypes["payment"]>,
	/** fetch aggregated fields from the table: "payment" */
	payment_aggregate: GraphQLTypes["payment_aggregate"],
	/** fetch data from the table: "payment" using primary key columns */
	payment_by_pk?: GraphQLTypes["payment"] | undefined | null,
	/** fetch data from the table in a streaming manner: "payment" */
	payment_stream: Array<GraphQLTypes["payment"]>,
	/** fetch data from the table: "rental" */
	rental: Array<GraphQLTypes["rental"]>,
	/** fetch aggregated fields from the table: "rental" */
	rental_aggregate: GraphQLTypes["rental_aggregate"],
	/** fetch data from the table: "rental" using primary key columns */
	rental_by_pk?: GraphQLTypes["rental"] | undefined | null,
	/** fetch data from the table in a streaming manner: "rental" */
	rental_stream: Array<GraphQLTypes["rental"]>,
	/** fetch data from the table: "sales_by_film_category" */
	sales_by_film_category: Array<GraphQLTypes["sales_by_film_category"]>,
	/** fetch aggregated fields from the table: "sales_by_film_category" */
	sales_by_film_category_aggregate: GraphQLTypes["sales_by_film_category_aggregate"],
	/** fetch data from the table in a streaming manner: "sales_by_film_category" */
	sales_by_film_category_stream: Array<GraphQLTypes["sales_by_film_category"]>,
	/** fetch data from the table: "sales_by_store" */
	sales_by_store: Array<GraphQLTypes["sales_by_store"]>,
	/** fetch aggregated fields from the table: "sales_by_store" */
	sales_by_store_aggregate: GraphQLTypes["sales_by_store_aggregate"],
	/** fetch data from the table in a streaming manner: "sales_by_store" */
	sales_by_store_stream: Array<GraphQLTypes["sales_by_store"]>,
	/** fetch data from the table: "staff" */
	staff: Array<GraphQLTypes["staff"]>,
	/** fetch aggregated fields from the table: "staff" */
	staff_aggregate: GraphQLTypes["staff_aggregate"],
	/** fetch data from the table: "staff" using primary key columns */
	staff_by_pk?: GraphQLTypes["staff"] | undefined | null,
	/** fetch data from the table: "staff_list" */
	staff_list: Array<GraphQLTypes["staff_list"]>,
	/** fetch aggregated fields from the table: "staff_list" */
	staff_list_aggregate: GraphQLTypes["staff_list_aggregate"],
	/** fetch data from the table in a streaming manner: "staff_list" */
	staff_list_stream: Array<GraphQLTypes["staff_list"]>,
	/** fetch data from the table in a streaming manner: "staff" */
	staff_stream: Array<GraphQLTypes["staff"]>,
	/** fetch data from the table: "store" */
	store: Array<GraphQLTypes["store"]>,
	/** fetch aggregated fields from the table: "store" */
	store_aggregate: GraphQLTypes["store_aggregate"],
	/** fetch data from the table: "store" using primary key columns */
	store_by_pk?: GraphQLTypes["store"] | undefined | null,
	/** fetch data from the table in a streaming manner: "store" */
	store_stream: Array<GraphQLTypes["store"]>
};
	["timestamp"]: "scalar" & { name: "timestamp" };
	/** Boolean expression to compare columns of type "timestamp". All fields are combined with logical 'AND'. */
["timestamp_comparison_exp"]: {
		_eq?: GraphQLTypes["timestamp"] | undefined | null,
	_gt?: GraphQLTypes["timestamp"] | undefined | null,
	_gte?: GraphQLTypes["timestamp"] | undefined | null,
	_in?: Array<GraphQLTypes["timestamp"]> | undefined | null,
	_is_null?: boolean | undefined | null,
	_lt?: GraphQLTypes["timestamp"] | undefined | null,
	_lte?: GraphQLTypes["timestamp"] | undefined | null,
	_neq?: GraphQLTypes["timestamp"] | undefined | null,
	_nin?: Array<GraphQLTypes["timestamp"]> | undefined | null
};
	["tsvector"]: "scalar" & { name: "tsvector" };
	/** Boolean expression to compare columns of type "tsvector". All fields are combined with logical 'AND'. */
["tsvector_comparison_exp"]: {
		_eq?: GraphQLTypes["tsvector"] | undefined | null,
	_gt?: GraphQLTypes["tsvector"] | undefined | null,
	_gte?: GraphQLTypes["tsvector"] | undefined | null,
	_in?: Array<GraphQLTypes["tsvector"]> | undefined | null,
	_is_null?: boolean | undefined | null,
	_lt?: GraphQLTypes["tsvector"] | undefined | null,
	_lte?: GraphQLTypes["tsvector"] | undefined | null,
	_neq?: GraphQLTypes["tsvector"] | undefined | null,
	_nin?: Array<GraphQLTypes["tsvector"]> | undefined | null
}
    }
/** unique or primary key constraints on table "actor" */
export enum actor_constraint {
	actor_pkey = "actor_pkey"
}
/** select columns of table "actor_info" */
export enum actor_info_select_column {
	actor_id = "actor_id",
	film_info = "film_info",
	first_name = "first_name",
	last_name = "last_name"
}
/** select columns of table "actor" */
export enum actor_select_column {
	actor_id = "actor_id",
	first_name = "first_name",
	last_name = "last_name",
	last_update = "last_update"
}
/** update columns of table "actor" */
export enum actor_update_column {
	actor_id = "actor_id",
	first_name = "first_name",
	last_name = "last_name",
	last_update = "last_update"
}
/** unique or primary key constraints on table "address" */
export enum address_constraint {
	address_pkey = "address_pkey"
}
/** select columns of table "address" */
export enum address_select_column {
	address = "address",
	address2 = "address2",
	address_id = "address_id",
	city_id = "city_id",
	district = "district",
	last_update = "last_update",
	phone = "phone",
	postal_code = "postal_code"
}
/** update columns of table "address" */
export enum address_update_column {
	address = "address",
	address2 = "address2",
	address_id = "address_id",
	city_id = "city_id",
	district = "district",
	last_update = "last_update",
	phone = "phone",
	postal_code = "postal_code"
}
/** unique or primary key constraints on table "category" */
export enum category_constraint {
	category_pkey = "category_pkey"
}
/** select columns of table "category" */
export enum category_select_column {
	category_id = "category_id",
	last_update = "last_update",
	name = "name"
}
/** update columns of table "category" */
export enum category_update_column {
	category_id = "category_id",
	last_update = "last_update",
	name = "name"
}
/** unique or primary key constraints on table "city" */
export enum city_constraint {
	city_pkey = "city_pkey"
}
/** select columns of table "city" */
export enum city_select_column {
	city = "city",
	city_id = "city_id",
	country_id = "country_id",
	last_update = "last_update"
}
/** update columns of table "city" */
export enum city_update_column {
	city = "city",
	city_id = "city_id",
	country_id = "country_id",
	last_update = "last_update"
}
/** unique or primary key constraints on table "country" */
export enum country_constraint {
	country_pkey = "country_pkey"
}
/** select columns of table "country" */
export enum country_select_column {
	country = "country",
	country_id = "country_id",
	last_update = "last_update"
}
/** update columns of table "country" */
export enum country_update_column {
	country = "country",
	country_id = "country_id",
	last_update = "last_update"
}
/** ordering argument of a cursor */
export enum cursor_ordering {
	ASC = "ASC",
	DESC = "DESC"
}
/** unique or primary key constraints on table "customer" */
export enum customer_constraint {
	customer_pkey = "customer_pkey"
}
/** select columns of table "customer_list" */
export enum customer_list_select_column {
	address = "address",
	city = "city",
	country = "country",
	id = "id",
	name = "name",
	notes = "notes",
	phone = "phone",
	sid = "sid",
	zip_code = "zip_code"
}
/** select columns of table "customer" */
export enum customer_select_column {
	active = "active",
	activebool = "activebool",
	address_id = "address_id",
	create_date = "create_date",
	customer_id = "customer_id",
	email = "email",
	first_name = "first_name",
	last_name = "last_name",
	last_update = "last_update",
	store_id = "store_id"
}
/** update columns of table "customer" */
export enum customer_update_column {
	active = "active",
	activebool = "activebool",
	address_id = "address_id",
	create_date = "create_date",
	customer_id = "customer_id",
	email = "email",
	first_name = "first_name",
	last_name = "last_name",
	last_update = "last_update",
	store_id = "store_id"
}
/** unique or primary key constraints on table "film_actor" */
export enum film_actor_constraint {
	film_actor_pkey = "film_actor_pkey"
}
/** select columns of table "film_actor" */
export enum film_actor_select_column {
	actor_id = "actor_id",
	film_id = "film_id",
	last_update = "last_update"
}
/** update columns of table "film_actor" */
export enum film_actor_update_column {
	actor_id = "actor_id",
	film_id = "film_id",
	last_update = "last_update"
}
/** unique or primary key constraints on table "film_category" */
export enum film_category_constraint {
	film_category_pkey = "film_category_pkey"
}
/** select columns of table "film_category" */
export enum film_category_select_column {
	category_id = "category_id",
	film_id = "film_id",
	last_update = "last_update"
}
/** update columns of table "film_category" */
export enum film_category_update_column {
	category_id = "category_id",
	film_id = "film_id",
	last_update = "last_update"
}
/** unique or primary key constraints on table "film" */
export enum film_constraint {
	film_pkey = "film_pkey"
}
/** select columns of table "film_list" */
export enum film_list_select_column {
	actors = "actors",
	category = "category",
	description = "description",
	fid = "fid",
	length = "length",
	price = "price",
	rating = "rating",
	title = "title"
}
/** select columns of table "film" */
export enum film_select_column {
	description = "description",
	film_id = "film_id",
	fulltext = "fulltext",
	language_id = "language_id",
	last_update = "last_update",
	length = "length",
	rating = "rating",
	release_year = "release_year",
	rental_duration = "rental_duration",
	rental_rate = "rental_rate",
	replacement_cost = "replacement_cost",
	special_features = "special_features",
	title = "title"
}
/** update columns of table "film" */
export enum film_update_column {
	description = "description",
	film_id = "film_id",
	fulltext = "fulltext",
	language_id = "language_id",
	last_update = "last_update",
	length = "length",
	rating = "rating",
	release_year = "release_year",
	rental_duration = "rental_duration",
	rental_rate = "rental_rate",
	replacement_cost = "replacement_cost",
	special_features = "special_features",
	title = "title"
}
/** unique or primary key constraints on table "inventory" */
export enum inventory_constraint {
	inventory_pkey = "inventory_pkey"
}
/** select columns of table "inventory" */
export enum inventory_select_column {
	film_id = "film_id",
	inventory_id = "inventory_id",
	last_update = "last_update",
	store_id = "store_id"
}
/** update columns of table "inventory" */
export enum inventory_update_column {
	film_id = "film_id",
	inventory_id = "inventory_id",
	last_update = "last_update",
	store_id = "store_id"
}
/** unique or primary key constraints on table "language" */
export enum language_constraint {
	language_pkey = "language_pkey"
}
/** select columns of table "language" */
export enum language_select_column {
	language_id = "language_id",
	last_update = "last_update",
	name = "name"
}
/** update columns of table "language" */
export enum language_update_column {
	language_id = "language_id",
	last_update = "last_update",
	name = "name"
}
/** select columns of table "nicer_but_slower_film_list" */
export enum nicer_but_slower_film_list_select_column {
	actors = "actors",
	category = "category",
	description = "description",
	fid = "fid",
	length = "length",
	price = "price",
	rating = "rating",
	title = "title"
}
/** column ordering options */
export enum order_by {
	asc = "asc",
	asc_nulls_first = "asc_nulls_first",
	asc_nulls_last = "asc_nulls_last",
	desc = "desc",
	desc_nulls_first = "desc_nulls_first",
	desc_nulls_last = "desc_nulls_last"
}
/** unique or primary key constraints on table "payment" */
export enum payment_constraint {
	payment_pkey = "payment_pkey"
}
/** select columns of table "payment" */
export enum payment_select_column {
	amount = "amount",
	customer_id = "customer_id",
	payment_date = "payment_date",
	payment_id = "payment_id",
	rental_id = "rental_id",
	staff_id = "staff_id"
}
/** update columns of table "payment" */
export enum payment_update_column {
	amount = "amount",
	customer_id = "customer_id",
	payment_date = "payment_date",
	payment_id = "payment_id",
	rental_id = "rental_id",
	staff_id = "staff_id"
}
/** unique or primary key constraints on table "rental" */
export enum rental_constraint {
	idx_unq_rental_rental_date_inventory_id_customer_id = "idx_unq_rental_rental_date_inventory_id_customer_id",
	rental_pkey = "rental_pkey"
}
/** select columns of table "rental" */
export enum rental_select_column {
	customer_id = "customer_id",
	inventory_id = "inventory_id",
	last_update = "last_update",
	rental_date = "rental_date",
	rental_id = "rental_id",
	return_date = "return_date",
	staff_id = "staff_id"
}
/** update columns of table "rental" */
export enum rental_update_column {
	customer_id = "customer_id",
	inventory_id = "inventory_id",
	last_update = "last_update",
	rental_date = "rental_date",
	rental_id = "rental_id",
	return_date = "return_date",
	staff_id = "staff_id"
}
/** select columns of table "sales_by_film_category" */
export enum sales_by_film_category_select_column {
	category = "category",
	total_sales = "total_sales"
}
/** select columns of table "sales_by_store" */
export enum sales_by_store_select_column {
	manager = "manager",
	store = "store",
	total_sales = "total_sales"
}
/** unique or primary key constraints on table "staff" */
export enum staff_constraint {
	staff_pkey = "staff_pkey"
}
/** select columns of table "staff_list" */
export enum staff_list_select_column {
	address = "address",
	city = "city",
	country = "country",
	id = "id",
	name = "name",
	phone = "phone",
	sid = "sid",
	zip_code = "zip_code"
}
/** select columns of table "staff" */
export enum staff_select_column {
	active = "active",
	address_id = "address_id",
	email = "email",
	first_name = "first_name",
	last_name = "last_name",
	last_update = "last_update",
	password = "password",
	picture = "picture",
	staff_id = "staff_id",
	store_id = "store_id",
	username = "username"
}
/** update columns of table "staff" */
export enum staff_update_column {
	active = "active",
	address_id = "address_id",
	email = "email",
	first_name = "first_name",
	last_name = "last_name",
	last_update = "last_update",
	password = "password",
	picture = "picture",
	staff_id = "staff_id",
	store_id = "store_id",
	username = "username"
}
/** unique or primary key constraints on table "store" */
export enum store_constraint {
	idx_unq_manager_staff_id = "idx_unq_manager_staff_id",
	store_pkey = "store_pkey"
}
/** select columns of table "store" */
export enum store_select_column {
	address_id = "address_id",
	last_update = "last_update",
	manager_staff_id = "manager_staff_id",
	store_id = "store_id"
}
/** update columns of table "store" */
export enum store_update_column {
	address_id = "address_id",
	last_update = "last_update",
	manager_staff_id = "manager_staff_id",
	store_id = "store_id"
}

type ZEUS_VARIABLES = {
	["Boolean_comparison_exp"]: ValueTypes["Boolean_comparison_exp"];
	["Int_comparison_exp"]: ValueTypes["Int_comparison_exp"];
	["String_comparison_exp"]: ValueTypes["String_comparison_exp"];
	["_text"]: ValueTypes["_text"];
	["_text_comparison_exp"]: ValueTypes["_text_comparison_exp"];
	["actor_bool_exp"]: ValueTypes["actor_bool_exp"];
	["actor_constraint"]: ValueTypes["actor_constraint"];
	["actor_inc_input"]: ValueTypes["actor_inc_input"];
	["actor_info_bool_exp"]: ValueTypes["actor_info_bool_exp"];
	["actor_info_order_by"]: ValueTypes["actor_info_order_by"];
	["actor_info_select_column"]: ValueTypes["actor_info_select_column"];
	["actor_info_stream_cursor_input"]: ValueTypes["actor_info_stream_cursor_input"];
	["actor_info_stream_cursor_value_input"]: ValueTypes["actor_info_stream_cursor_value_input"];
	["actor_insert_input"]: ValueTypes["actor_insert_input"];
	["actor_on_conflict"]: ValueTypes["actor_on_conflict"];
	["actor_order_by"]: ValueTypes["actor_order_by"];
	["actor_pk_columns_input"]: ValueTypes["actor_pk_columns_input"];
	["actor_select_column"]: ValueTypes["actor_select_column"];
	["actor_set_input"]: ValueTypes["actor_set_input"];
	["actor_stream_cursor_input"]: ValueTypes["actor_stream_cursor_input"];
	["actor_stream_cursor_value_input"]: ValueTypes["actor_stream_cursor_value_input"];
	["actor_update_column"]: ValueTypes["actor_update_column"];
	["actor_updates"]: ValueTypes["actor_updates"];
	["address_bool_exp"]: ValueTypes["address_bool_exp"];
	["address_constraint"]: ValueTypes["address_constraint"];
	["address_inc_input"]: ValueTypes["address_inc_input"];
	["address_insert_input"]: ValueTypes["address_insert_input"];
	["address_on_conflict"]: ValueTypes["address_on_conflict"];
	["address_order_by"]: ValueTypes["address_order_by"];
	["address_pk_columns_input"]: ValueTypes["address_pk_columns_input"];
	["address_select_column"]: ValueTypes["address_select_column"];
	["address_set_input"]: ValueTypes["address_set_input"];
	["address_stream_cursor_input"]: ValueTypes["address_stream_cursor_input"];
	["address_stream_cursor_value_input"]: ValueTypes["address_stream_cursor_value_input"];
	["address_update_column"]: ValueTypes["address_update_column"];
	["address_updates"]: ValueTypes["address_updates"];
	["bpchar"]: ValueTypes["bpchar"];
	["bpchar_comparison_exp"]: ValueTypes["bpchar_comparison_exp"];
	["bytea"]: ValueTypes["bytea"];
	["bytea_comparison_exp"]: ValueTypes["bytea_comparison_exp"];
	["category_bool_exp"]: ValueTypes["category_bool_exp"];
	["category_constraint"]: ValueTypes["category_constraint"];
	["category_inc_input"]: ValueTypes["category_inc_input"];
	["category_insert_input"]: ValueTypes["category_insert_input"];
	["category_on_conflict"]: ValueTypes["category_on_conflict"];
	["category_order_by"]: ValueTypes["category_order_by"];
	["category_pk_columns_input"]: ValueTypes["category_pk_columns_input"];
	["category_select_column"]: ValueTypes["category_select_column"];
	["category_set_input"]: ValueTypes["category_set_input"];
	["category_stream_cursor_input"]: ValueTypes["category_stream_cursor_input"];
	["category_stream_cursor_value_input"]: ValueTypes["category_stream_cursor_value_input"];
	["category_update_column"]: ValueTypes["category_update_column"];
	["category_updates"]: ValueTypes["category_updates"];
	["city_bool_exp"]: ValueTypes["city_bool_exp"];
	["city_constraint"]: ValueTypes["city_constraint"];
	["city_inc_input"]: ValueTypes["city_inc_input"];
	["city_insert_input"]: ValueTypes["city_insert_input"];
	["city_on_conflict"]: ValueTypes["city_on_conflict"];
	["city_order_by"]: ValueTypes["city_order_by"];
	["city_pk_columns_input"]: ValueTypes["city_pk_columns_input"];
	["city_select_column"]: ValueTypes["city_select_column"];
	["city_set_input"]: ValueTypes["city_set_input"];
	["city_stream_cursor_input"]: ValueTypes["city_stream_cursor_input"];
	["city_stream_cursor_value_input"]: ValueTypes["city_stream_cursor_value_input"];
	["city_update_column"]: ValueTypes["city_update_column"];
	["city_updates"]: ValueTypes["city_updates"];
	["country_bool_exp"]: ValueTypes["country_bool_exp"];
	["country_constraint"]: ValueTypes["country_constraint"];
	["country_inc_input"]: ValueTypes["country_inc_input"];
	["country_insert_input"]: ValueTypes["country_insert_input"];
	["country_on_conflict"]: ValueTypes["country_on_conflict"];
	["country_order_by"]: ValueTypes["country_order_by"];
	["country_pk_columns_input"]: ValueTypes["country_pk_columns_input"];
	["country_select_column"]: ValueTypes["country_select_column"];
	["country_set_input"]: ValueTypes["country_set_input"];
	["country_stream_cursor_input"]: ValueTypes["country_stream_cursor_input"];
	["country_stream_cursor_value_input"]: ValueTypes["country_stream_cursor_value_input"];
	["country_update_column"]: ValueTypes["country_update_column"];
	["country_updates"]: ValueTypes["country_updates"];
	["cursor_ordering"]: ValueTypes["cursor_ordering"];
	["customer_bool_exp"]: ValueTypes["customer_bool_exp"];
	["customer_constraint"]: ValueTypes["customer_constraint"];
	["customer_inc_input"]: ValueTypes["customer_inc_input"];
	["customer_insert_input"]: ValueTypes["customer_insert_input"];
	["customer_list_bool_exp"]: ValueTypes["customer_list_bool_exp"];
	["customer_list_order_by"]: ValueTypes["customer_list_order_by"];
	["customer_list_select_column"]: ValueTypes["customer_list_select_column"];
	["customer_list_stream_cursor_input"]: ValueTypes["customer_list_stream_cursor_input"];
	["customer_list_stream_cursor_value_input"]: ValueTypes["customer_list_stream_cursor_value_input"];
	["customer_on_conflict"]: ValueTypes["customer_on_conflict"];
	["customer_order_by"]: ValueTypes["customer_order_by"];
	["customer_pk_columns_input"]: ValueTypes["customer_pk_columns_input"];
	["customer_select_column"]: ValueTypes["customer_select_column"];
	["customer_set_input"]: ValueTypes["customer_set_input"];
	["customer_stream_cursor_input"]: ValueTypes["customer_stream_cursor_input"];
	["customer_stream_cursor_value_input"]: ValueTypes["customer_stream_cursor_value_input"];
	["customer_update_column"]: ValueTypes["customer_update_column"];
	["customer_updates"]: ValueTypes["customer_updates"];
	["date"]: ValueTypes["date"];
	["date_comparison_exp"]: ValueTypes["date_comparison_exp"];
	["film_actor_bool_exp"]: ValueTypes["film_actor_bool_exp"];
	["film_actor_constraint"]: ValueTypes["film_actor_constraint"];
	["film_actor_inc_input"]: ValueTypes["film_actor_inc_input"];
	["film_actor_insert_input"]: ValueTypes["film_actor_insert_input"];
	["film_actor_on_conflict"]: ValueTypes["film_actor_on_conflict"];
	["film_actor_order_by"]: ValueTypes["film_actor_order_by"];
	["film_actor_pk_columns_input"]: ValueTypes["film_actor_pk_columns_input"];
	["film_actor_select_column"]: ValueTypes["film_actor_select_column"];
	["film_actor_set_input"]: ValueTypes["film_actor_set_input"];
	["film_actor_stream_cursor_input"]: ValueTypes["film_actor_stream_cursor_input"];
	["film_actor_stream_cursor_value_input"]: ValueTypes["film_actor_stream_cursor_value_input"];
	["film_actor_update_column"]: ValueTypes["film_actor_update_column"];
	["film_actor_updates"]: ValueTypes["film_actor_updates"];
	["film_bool_exp"]: ValueTypes["film_bool_exp"];
	["film_category_bool_exp"]: ValueTypes["film_category_bool_exp"];
	["film_category_constraint"]: ValueTypes["film_category_constraint"];
	["film_category_inc_input"]: ValueTypes["film_category_inc_input"];
	["film_category_insert_input"]: ValueTypes["film_category_insert_input"];
	["film_category_on_conflict"]: ValueTypes["film_category_on_conflict"];
	["film_category_order_by"]: ValueTypes["film_category_order_by"];
	["film_category_pk_columns_input"]: ValueTypes["film_category_pk_columns_input"];
	["film_category_select_column"]: ValueTypes["film_category_select_column"];
	["film_category_set_input"]: ValueTypes["film_category_set_input"];
	["film_category_stream_cursor_input"]: ValueTypes["film_category_stream_cursor_input"];
	["film_category_stream_cursor_value_input"]: ValueTypes["film_category_stream_cursor_value_input"];
	["film_category_update_column"]: ValueTypes["film_category_update_column"];
	["film_category_updates"]: ValueTypes["film_category_updates"];
	["film_constraint"]: ValueTypes["film_constraint"];
	["film_inc_input"]: ValueTypes["film_inc_input"];
	["film_insert_input"]: ValueTypes["film_insert_input"];
	["film_list_bool_exp"]: ValueTypes["film_list_bool_exp"];
	["film_list_order_by"]: ValueTypes["film_list_order_by"];
	["film_list_select_column"]: ValueTypes["film_list_select_column"];
	["film_list_stream_cursor_input"]: ValueTypes["film_list_stream_cursor_input"];
	["film_list_stream_cursor_value_input"]: ValueTypes["film_list_stream_cursor_value_input"];
	["film_on_conflict"]: ValueTypes["film_on_conflict"];
	["film_order_by"]: ValueTypes["film_order_by"];
	["film_pk_columns_input"]: ValueTypes["film_pk_columns_input"];
	["film_select_column"]: ValueTypes["film_select_column"];
	["film_set_input"]: ValueTypes["film_set_input"];
	["film_stream_cursor_input"]: ValueTypes["film_stream_cursor_input"];
	["film_stream_cursor_value_input"]: ValueTypes["film_stream_cursor_value_input"];
	["film_update_column"]: ValueTypes["film_update_column"];
	["film_updates"]: ValueTypes["film_updates"];
	["inventory_bool_exp"]: ValueTypes["inventory_bool_exp"];
	["inventory_constraint"]: ValueTypes["inventory_constraint"];
	["inventory_inc_input"]: ValueTypes["inventory_inc_input"];
	["inventory_insert_input"]: ValueTypes["inventory_insert_input"];
	["inventory_on_conflict"]: ValueTypes["inventory_on_conflict"];
	["inventory_order_by"]: ValueTypes["inventory_order_by"];
	["inventory_pk_columns_input"]: ValueTypes["inventory_pk_columns_input"];
	["inventory_select_column"]: ValueTypes["inventory_select_column"];
	["inventory_set_input"]: ValueTypes["inventory_set_input"];
	["inventory_stream_cursor_input"]: ValueTypes["inventory_stream_cursor_input"];
	["inventory_stream_cursor_value_input"]: ValueTypes["inventory_stream_cursor_value_input"];
	["inventory_update_column"]: ValueTypes["inventory_update_column"];
	["inventory_updates"]: ValueTypes["inventory_updates"];
	["language_bool_exp"]: ValueTypes["language_bool_exp"];
	["language_constraint"]: ValueTypes["language_constraint"];
	["language_inc_input"]: ValueTypes["language_inc_input"];
	["language_insert_input"]: ValueTypes["language_insert_input"];
	["language_on_conflict"]: ValueTypes["language_on_conflict"];
	["language_order_by"]: ValueTypes["language_order_by"];
	["language_pk_columns_input"]: ValueTypes["language_pk_columns_input"];
	["language_select_column"]: ValueTypes["language_select_column"];
	["language_set_input"]: ValueTypes["language_set_input"];
	["language_stream_cursor_input"]: ValueTypes["language_stream_cursor_input"];
	["language_stream_cursor_value_input"]: ValueTypes["language_stream_cursor_value_input"];
	["language_update_column"]: ValueTypes["language_update_column"];
	["language_updates"]: ValueTypes["language_updates"];
	["mpaa_rating"]: ValueTypes["mpaa_rating"];
	["mpaa_rating_comparison_exp"]: ValueTypes["mpaa_rating_comparison_exp"];
	["nicer_but_slower_film_list_bool_exp"]: ValueTypes["nicer_but_slower_film_list_bool_exp"];
	["nicer_but_slower_film_list_order_by"]: ValueTypes["nicer_but_slower_film_list_order_by"];
	["nicer_but_slower_film_list_select_column"]: ValueTypes["nicer_but_slower_film_list_select_column"];
	["nicer_but_slower_film_list_stream_cursor_input"]: ValueTypes["nicer_but_slower_film_list_stream_cursor_input"];
	["nicer_but_slower_film_list_stream_cursor_value_input"]: ValueTypes["nicer_but_slower_film_list_stream_cursor_value_input"];
	["numeric"]: ValueTypes["numeric"];
	["numeric_comparison_exp"]: ValueTypes["numeric_comparison_exp"];
	["order_by"]: ValueTypes["order_by"];
	["payment_bool_exp"]: ValueTypes["payment_bool_exp"];
	["payment_constraint"]: ValueTypes["payment_constraint"];
	["payment_inc_input"]: ValueTypes["payment_inc_input"];
	["payment_insert_input"]: ValueTypes["payment_insert_input"];
	["payment_on_conflict"]: ValueTypes["payment_on_conflict"];
	["payment_order_by"]: ValueTypes["payment_order_by"];
	["payment_pk_columns_input"]: ValueTypes["payment_pk_columns_input"];
	["payment_select_column"]: ValueTypes["payment_select_column"];
	["payment_set_input"]: ValueTypes["payment_set_input"];
	["payment_stream_cursor_input"]: ValueTypes["payment_stream_cursor_input"];
	["payment_stream_cursor_value_input"]: ValueTypes["payment_stream_cursor_value_input"];
	["payment_update_column"]: ValueTypes["payment_update_column"];
	["payment_updates"]: ValueTypes["payment_updates"];
	["rental_bool_exp"]: ValueTypes["rental_bool_exp"];
	["rental_constraint"]: ValueTypes["rental_constraint"];
	["rental_inc_input"]: ValueTypes["rental_inc_input"];
	["rental_insert_input"]: ValueTypes["rental_insert_input"];
	["rental_on_conflict"]: ValueTypes["rental_on_conflict"];
	["rental_order_by"]: ValueTypes["rental_order_by"];
	["rental_pk_columns_input"]: ValueTypes["rental_pk_columns_input"];
	["rental_select_column"]: ValueTypes["rental_select_column"];
	["rental_set_input"]: ValueTypes["rental_set_input"];
	["rental_stream_cursor_input"]: ValueTypes["rental_stream_cursor_input"];
	["rental_stream_cursor_value_input"]: ValueTypes["rental_stream_cursor_value_input"];
	["rental_update_column"]: ValueTypes["rental_update_column"];
	["rental_updates"]: ValueTypes["rental_updates"];
	["sales_by_film_category_bool_exp"]: ValueTypes["sales_by_film_category_bool_exp"];
	["sales_by_film_category_order_by"]: ValueTypes["sales_by_film_category_order_by"];
	["sales_by_film_category_select_column"]: ValueTypes["sales_by_film_category_select_column"];
	["sales_by_film_category_stream_cursor_input"]: ValueTypes["sales_by_film_category_stream_cursor_input"];
	["sales_by_film_category_stream_cursor_value_input"]: ValueTypes["sales_by_film_category_stream_cursor_value_input"];
	["sales_by_store_bool_exp"]: ValueTypes["sales_by_store_bool_exp"];
	["sales_by_store_order_by"]: ValueTypes["sales_by_store_order_by"];
	["sales_by_store_select_column"]: ValueTypes["sales_by_store_select_column"];
	["sales_by_store_stream_cursor_input"]: ValueTypes["sales_by_store_stream_cursor_input"];
	["sales_by_store_stream_cursor_value_input"]: ValueTypes["sales_by_store_stream_cursor_value_input"];
	["smallint"]: ValueTypes["smallint"];
	["smallint_comparison_exp"]: ValueTypes["smallint_comparison_exp"];
	["staff_bool_exp"]: ValueTypes["staff_bool_exp"];
	["staff_constraint"]: ValueTypes["staff_constraint"];
	["staff_inc_input"]: ValueTypes["staff_inc_input"];
	["staff_insert_input"]: ValueTypes["staff_insert_input"];
	["staff_list_bool_exp"]: ValueTypes["staff_list_bool_exp"];
	["staff_list_order_by"]: ValueTypes["staff_list_order_by"];
	["staff_list_select_column"]: ValueTypes["staff_list_select_column"];
	["staff_list_stream_cursor_input"]: ValueTypes["staff_list_stream_cursor_input"];
	["staff_list_stream_cursor_value_input"]: ValueTypes["staff_list_stream_cursor_value_input"];
	["staff_on_conflict"]: ValueTypes["staff_on_conflict"];
	["staff_order_by"]: ValueTypes["staff_order_by"];
	["staff_pk_columns_input"]: ValueTypes["staff_pk_columns_input"];
	["staff_select_column"]: ValueTypes["staff_select_column"];
	["staff_set_input"]: ValueTypes["staff_set_input"];
	["staff_stream_cursor_input"]: ValueTypes["staff_stream_cursor_input"];
	["staff_stream_cursor_value_input"]: ValueTypes["staff_stream_cursor_value_input"];
	["staff_update_column"]: ValueTypes["staff_update_column"];
	["staff_updates"]: ValueTypes["staff_updates"];
	["store_bool_exp"]: ValueTypes["store_bool_exp"];
	["store_constraint"]: ValueTypes["store_constraint"];
	["store_inc_input"]: ValueTypes["store_inc_input"];
	["store_insert_input"]: ValueTypes["store_insert_input"];
	["store_on_conflict"]: ValueTypes["store_on_conflict"];
	["store_order_by"]: ValueTypes["store_order_by"];
	["store_pk_columns_input"]: ValueTypes["store_pk_columns_input"];
	["store_select_column"]: ValueTypes["store_select_column"];
	["store_set_input"]: ValueTypes["store_set_input"];
	["store_stream_cursor_input"]: ValueTypes["store_stream_cursor_input"];
	["store_stream_cursor_value_input"]: ValueTypes["store_stream_cursor_value_input"];
	["store_update_column"]: ValueTypes["store_update_column"];
	["store_updates"]: ValueTypes["store_updates"];
	["timestamp"]: ValueTypes["timestamp"];
	["timestamp_comparison_exp"]: ValueTypes["timestamp_comparison_exp"];
	["tsvector"]: ValueTypes["tsvector"];
	["tsvector_comparison_exp"]: ValueTypes["tsvector_comparison_exp"];
}