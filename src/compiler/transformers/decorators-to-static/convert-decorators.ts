import { methodDecoratorsToStatic } from './method-decorator';
import * as d from '../../../declarations';
import { elementDecoratorsToStatic } from './element-decorator';
import { eventDecoratorsToStatic } from './event-decorator';
import { listenDecoratorsToStatic } from './listen-decorator';
import { CLASS_DECORATORS_TO_REMOVE, MEMBER_DECORATORS_TO_REMOVE, isDecoratorNamed } from './decorator-utils';
import { componentDecoratorToStatic } from './component-decorator';
import { propDecoratorsToStatic } from './prop-decorator';
import { stateDecoratorsToStatic } from './state-decorator';
import { watchDecoratorsToStatic } from './watch-decorator';
import ts from 'typescript';


export const convertDecoratorsToStatic = (config: d.Config, diagnostics: d.Diagnostic[], typeChecker: ts.TypeChecker): ts.TransformerFactory<ts.SourceFile> => {

  return transformCtx => {

    const visit = (node: ts.Node): ts.VisitResult<ts.Node> => {
      if (ts.isClassDeclaration(node)) {
        return visitClass(config, diagnostics, typeChecker, node);
      }
      return ts.visitEachChild(node, visit, transformCtx);
    };

    return tsSourceFile => {
      return ts.visitEachChild(tsSourceFile, visit, transformCtx);
    };
  };
};


export const visitClass = (config: d.Config, diagnostics: d.Diagnostic[], typeChecker: ts.TypeChecker, classNode: ts.ClassDeclaration) => {
  if (!classNode.decorators) {
    return classNode;
  }

  const componentDecorator = classNode.decorators.find(isDecoratorNamed('Component'));
  if (!componentDecorator) {
    return classNode;
  }

  const decoratedMembers = classNode.members.filter(member => Array.isArray(member.decorators) && member.decorators.length > 0);
  const newMembers = removeStencilDecorators(Array.from(classNode.members));

  // parser component decorator (Component)
  componentDecoratorToStatic(config, typeChecker, diagnostics, classNode, newMembers, componentDecorator);

  // parse member decorators (Prop, State, Listen, Event, Method, Element and Watch)
  if (decoratedMembers.length > 0) {
    propDecoratorsToStatic(config, diagnostics, decoratedMembers, typeChecker, newMembers);
    stateDecoratorsToStatic(diagnostics, decoratedMembers, typeChecker, newMembers);
    eventDecoratorsToStatic(config, diagnostics, decoratedMembers, typeChecker, newMembers);
    methodDecoratorsToStatic(config, diagnostics, classNode, decoratedMembers, typeChecker, newMembers);
    elementDecoratorsToStatic(diagnostics, decoratedMembers, typeChecker, newMembers);
    watchDecoratorsToStatic(diagnostics, decoratedMembers, newMembers);
    listenDecoratorsToStatic(config, diagnostics, decoratedMembers, newMembers);
  }

  return ts.updateClassDeclaration(
    classNode,
    removeDecorators(classNode, CLASS_DECORATORS_TO_REMOVE),
    classNode.modifiers,
    classNode.name,
    classNode.typeParameters,
    classNode.heritageClauses,
    newMembers
  );
};

const removeStencilDecorators = (classMembers: ts.ClassElement[]) => {
  return classMembers.map(m => {
    const currentDecorators = m.decorators;
    const newDecorators = removeDecorators(m, MEMBER_DECORATORS_TO_REMOVE);
    if (currentDecorators !== newDecorators) {
      if (ts.isMethodDeclaration(m)) {
        return ts.updateMethod(
          m,
          newDecorators,
          m.modifiers,
          m.asteriskToken,
          m.name,
          m.questionToken,
          m.typeParameters,
          m.parameters,
          m.type,
          m.body
        );
      } else if (ts.isPropertyDeclaration(m)) {
        return ts.updateProperty(
          m,
          newDecorators,
          m.modifiers,
          m.name,
          m.questionToken,
          m.type,
          m.initializer
        );
      } else {
        console.log('unknown class node');
      }
    }
    return m;
  });
};


const removeDecorators = (node: ts.Node, decoratorNames: Set<string>) => {
  if (node.decorators) {
    const updatedDecoratorList = node.decorators.filter(dec => {
      const name = (
        ts.isCallExpression(dec.expression) &&
        ts.isIdentifier(dec.expression.expression) &&
        dec.expression.expression.text
      );
      return !decoratorNames.has(name);
    });
    if (updatedDecoratorList.length === 0) {
      return undefined;
    } else if (updatedDecoratorList.length !== node.decorators.length) {
      return ts.createNodeArray(updatedDecoratorList);
    }
  }
  return node.decorators;
};
