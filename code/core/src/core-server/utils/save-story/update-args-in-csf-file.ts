import { types as t, traverse } from 'storybook/internal/babel';

import { SaveStoryError } from './utils';
import { valueToAST } from './valueToAST';

export const updateArgsInCsfFile = async (node: t.Node, input: Record<string, any>) => {
  let found = false;
  const args = Object.fromEntries(
    Object.entries(input).map(([k, v]) => {
      return [k, valueToAST(v)];
    })
  );

  const isCsf4Story =
    t.isCallExpression(node) &&
    t.isMemberExpression(node.callee) &&
    t.isIdentifier(node.callee.property) &&
    node.callee.property.name === 'story';

  // detect CSF2 and throw
  if (!isCsf4Story && (t.isArrowFunctionExpression(node) || t.isCallExpression(node))) {
    throw new SaveStoryError(`Updating a CSF2 story is not supported`);
  }

  if (t.isObjectExpression(node)) {
    const properties = node.properties;
    const argsProperty = properties.find((property) => {
      if (t.isObjectProperty(property)) {
        const key = property.key;
        return t.isIdentifier(key) && key.name === 'args';
      }
      return false;
    });

    if (argsProperty) {
      if (t.isObjectProperty(argsProperty)) {
        const a = argsProperty.value;
        if (t.isObjectExpression(a)) {
          a.properties.forEach((p) => {
            if (t.isObjectProperty(p)) {
              const key = p.key;
              if (t.isIdentifier(key) && key.name in args) {
                p.value = args[key.name];
                delete args[key.name];
              }
            }
          });

          const remainder = Object.entries(args);
          if (Object.keys(args).length) {
            remainder.forEach(([key, value]) => {
              a.properties.push(t.objectProperty(t.identifier(key), value));
            });
          }
        }
      }
    } else {
      properties.unshift(
        t.objectProperty(
          t.identifier('args'),
          t.objectExpression(
            Object.entries(args).map(([key, value]) => t.objectProperty(t.identifier(key), value))
          )
        )
      );
    }
    return;
  }

  traverse(node, {
    ObjectExpression(path) {
      if (found) {
        return;
      }

      found = true;
      const properties = path.get('properties');
      const argsProperty = properties.find((property) => {
        if (property.isObjectProperty()) {
          const key = property.get('key');
          return key.isIdentifier() && key.node.name === 'args';
        }
        return false;
      });

      if (argsProperty) {
        if (argsProperty.isObjectProperty()) {
          const a = argsProperty.get('value');
          if (a.isObjectExpression()) {
            a.traverse({
              ObjectProperty(p) {
                const key = p.get('key');
                if (key.isIdentifier() && key.node.name in args) {
                  p.get('value').replaceWith(args[key.node.name]);
                  delete args[key.node.name];
                }
              },
              noScope: true,
            });

            const remainder = Object.entries(args);
            if (Object.keys(args).length) {
              remainder.forEach(([key, value]) => {
                a.pushContainer('properties', t.objectProperty(t.identifier(key), value));
              });
            }
          }
        }
      } else {
        path.unshiftContainer(
          'properties',
          t.objectProperty(
            t.identifier('args'),
            t.objectExpression(
              Object.entries(args).map(([key, value]) => t.objectProperty(t.identifier(key), value))
            )
          )
        );
      }
    },

    noScope: true,
  });
};
