package io.github.joaomacalos.sfcr.parser;

import java.util.LinkedHashSet;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;

public final class ExpressionParser {
    private static final Pattern LAG_PATTERN = Pattern.compile("([A-Za-z_][A-Za-z0-9_\\.]*)\\[-1\\]");
    private static final Pattern DIFF_PATTERN = Pattern.compile("\\bd\\(([A-Za-z_][A-Za-z0-9_\\.]*)\\)");

    public Expression parse(String source) {
        Objects.requireNonNull(source, "source");
        Parser parser = new Parser(normalize(source));
        Expression expression = parser.parseTopLevelExpression();
        parser.expect(TokenType.EOF);
        return expression;
    }

    private String normalize(String source) {
        String normalized = LAG_PATTERN.matcher(source).replaceAll("lag($1)");
        normalized = DIFF_PATTERN.matcher(normalized).replaceAll("diff($1)");
        return normalized;
    }

    private enum TokenType {
        NUMBER,
        IDENTIFIER,
        IF,
        ELSE,
        PLUS,
        MINUS,
        STAR,
        SLASH,
        CARET,
        LPAREN,
        RPAREN,
        LBRACE,
        RBRACE,
        COMMA,
        GT,
        GTE,
        LT,
        LTE,
        EQEQ,
        NEQ,
        ANDAND,
        OROR,
        EOF
    }

    private record Token(TokenType type, String text) {
    }

    private static final class Parser {
        private final Lexer lexer;
        private Token current;

        private Parser(String source) {
            this.lexer = new Lexer(source);
            this.current = lexer.nextToken();
        }

        private Expression parseTopLevelExpression() {
            if (current.type == TokenType.IF) {
                return parseIfExpression();
            }
            return parseLogicalOr();
        }

        private Expression parseIfExpression() {
            expect(TokenType.IF);
            expect(TokenType.LPAREN);
            Expression condition = parseLogicalOr();
            expect(TokenType.RPAREN);
            expect(TokenType.LBRACE);
            Expression whenTrue = parseTopLevelExpression();
            expect(TokenType.RBRACE);
            expect(TokenType.ELSE);
            expect(TokenType.LBRACE);
            Expression whenFalse = parseTopLevelExpression();
            expect(TokenType.RBRACE);
            return new IfExpression(condition, whenTrue, whenFalse);
        }

        private Expression parseLogicalOr() {
            Expression expression = parseLogicalAnd();
            while (current.type == TokenType.OROR) {
                Token operator = current;
                advance();
                Expression right = parseLogicalAnd();
                expression = new BinaryExpression(expression, right, operator.type);
            }
            return expression;
        }

        private Expression parseLogicalAnd() {
            Expression expression = parseEquality();
            while (current.type == TokenType.ANDAND) {
                Token operator = current;
                advance();
                Expression right = parseEquality();
                expression = new BinaryExpression(expression, right, operator.type);
            }
            return expression;
        }

        private Expression parseEquality() {
            Expression expression = parseComparison();
            while (current.type == TokenType.EQEQ || current.type == TokenType.NEQ) {
                Token operator = current;
                advance();
                Expression right = parseComparison();
                expression = new BinaryExpression(expression, right, operator.type);
            }
            return expression;
        }

        private Expression parseComparison() {
            Expression expression = parseAdditive();
            while (current.type == TokenType.GT
                || current.type == TokenType.GTE
                || current.type == TokenType.LT
                || current.type == TokenType.LTE) {
                Token operator = current;
                advance();
                Expression right = parseAdditive();
                expression = new BinaryExpression(expression, right, operator.type);
            }
            return expression;
        }

        private Expression parseAdditive() {
            Expression expression = parseMultiplicative();
            while (current.type == TokenType.PLUS || current.type == TokenType.MINUS) {
                Token operator = current;
                advance();
                Expression right = parseMultiplicative();
                expression = new BinaryExpression(expression, right, operator.type);
            }
            return expression;
        }

        private Expression parseMultiplicative() {
            Expression expression = parseUnary();
            while (current.type == TokenType.STAR || current.type == TokenType.SLASH) {
                Token operator = current;
                advance();
                Expression right = parseUnary();
                expression = new BinaryExpression(expression, right, operator.type);
            }
            return expression;
        }

        private Expression parseUnary() {
            if (current.type == TokenType.MINUS) {
                advance();
                return new UnaryMinusExpression(parseUnary());
            }

            return parsePower();
        }

        private Expression parsePower() {
            Expression expression = parsePrimary();
            if (current.type == TokenType.CARET) {
                Token operator = current;
                advance();
                Expression right = parseUnary();
                expression = new BinaryExpression(expression, right, operator.type);
            }
            return expression;
        }

        private Expression parsePrimary() {

            if (current.type == TokenType.NUMBER) {
                double value = Double.parseDouble(current.text);
                advance();
                return new NumberExpression(value);
            }

            if (current.type == TokenType.IDENTIFIER) {
                String identifier = current.text;
                advance();
                if (current.type == TokenType.LPAREN) {
                    return parseFunctionCall(identifier);
                }
                return new VariableExpression(identifier);
            }

            if (current.type == TokenType.LPAREN) {
                advance();
                Expression expression = parseTopLevelExpression();
                expect(TokenType.RPAREN);
                return expression;
            }

            throw new IllegalArgumentException("Unexpected token: " + current.text);
        }

        private Expression parseFunctionCall(String identifier) {
            expect(TokenType.LPAREN);
            return switch (identifier) {
                case "lag" -> {
                    String argument = expect(TokenType.IDENTIFIER).text;
                    expect(TokenType.RPAREN);
                    yield new LagExpression(argument);
                }
                case "diff" -> {
                    String argument = expect(TokenType.IDENTIFIER).text;
                    expect(TokenType.RPAREN);
                    yield new DiffExpression(argument);
                }
                case "exp", "log", "abs", "sqrt" -> {
                    Expression argument = parseTopLevelExpression();
                    expect(TokenType.RPAREN);
                    yield new UnaryFunctionExpression(identifier, argument);
                }
                case "min", "max" -> {
                    Expression first = parseTopLevelExpression();
                    expect(TokenType.COMMA);
                    Expression second = parseTopLevelExpression();
                    expect(TokenType.RPAREN);
                    yield new BinaryFunctionExpression(identifier, first, second);
                }
                default -> throw new IllegalArgumentException("Unsupported function: " + identifier);
            };
        }

        private Token expect(TokenType expected) {
            if (current.type != expected) {
                throw new IllegalArgumentException("Expected " + expected + " but found " + current.type);
            }
            Token token = current;
            advance();
            return token;
        }

        private void advance() {
            current = lexer.nextToken();
        }
    }

    private static final class Lexer {
        private final String source;
        private int index;

        private Lexer(String source) {
            this.source = source;
        }

        private Token nextToken() {
            skipWhitespace();
            if (index >= source.length()) {
                return new Token(TokenType.EOF, "");
            }

            char c = source.charAt(index);
            return switch (c) {
                case '+' -> single(TokenType.PLUS);
                case '-' -> single(TokenType.MINUS);
                case '*' -> single(TokenType.STAR);
                case '/' -> single(TokenType.SLASH);
                case '^' -> single(TokenType.CARET);
                case '(' -> single(TokenType.LPAREN);
                case ')' -> single(TokenType.RPAREN);
                case '{' -> single(TokenType.LBRACE);
                case '}' -> single(TokenType.RBRACE);
                case ',' -> single(TokenType.COMMA);
                case '>' -> match('=', TokenType.GTE, TokenType.GT);
                case '<' -> match('=', TokenType.LTE, TokenType.LT);
                case '=' -> {
                    if (peekNext() == '=') {
                        index += 2;
                        yield new Token(TokenType.EQEQ, "==");
                    }
                    throw new IllegalArgumentException("Unexpected character: =");
                }
                case '!' -> {
                    if (peekNext() == '=') {
                        index += 2;
                        yield new Token(TokenType.NEQ, "!=");
                    }
                    throw new IllegalArgumentException("Unexpected character: !");
                }
                case '&' -> {
                    if (peekNext() == '&') {
                        index += 2;
                        yield new Token(TokenType.ANDAND, "&&");
                    }
                    throw new IllegalArgumentException("Unexpected character: &");
                }
                case '|' -> {
                    if (peekNext() == '|') {
                        index += 2;
                        yield new Token(TokenType.OROR, "||");
                    }
                    throw new IllegalArgumentException("Unexpected character: |");
                }
                default -> {
                    if (Character.isDigit(c) || c == '.') {
                        yield number();
                    }
                    if (Character.isLetter(c) || c == '_') {
                        yield identifier();
                    }
                    throw new IllegalArgumentException("Unexpected character: " + c);
                }
            };
        }

        private void skipWhitespace() {
            while (index < source.length() && Character.isWhitespace(source.charAt(index))) {
                index++;
            }
        }

        private Token single(TokenType type) {
            char c = source.charAt(index++);
            return new Token(type, Character.toString(c));
        }

        private Token number() {
            int start = index;
            while (index < source.length()) {
                char c = source.charAt(index);
                if (Character.isDigit(c) || c == '.') {
                    index++;
                } else {
                    break;
                }
            }
            return new Token(TokenType.NUMBER, source.substring(start, index));
        }

        private Token identifier() {
            int start = index;
            while (index < source.length()) {
                char c = source.charAt(index);
                if (Character.isLetterOrDigit(c) || c == '_' || c == '.') {
                    index++;
                } else {
                    break;
                }
            }
            String text = source.substring(start, index);
            return switch (text) {
                case "if" -> new Token(TokenType.IF, text);
                case "else" -> new Token(TokenType.ELSE, text);
                default -> new Token(TokenType.IDENTIFIER, text);
            };
        }

        private Token match(char expectedNext, TokenType matched, TokenType single) {
            if (peekNext() == expectedNext) {
                index += 2;
                return new Token(matched, source.substring(index - 2, index));
            }
            index++;
            return new Token(single, source.substring(index - 1, index));
        }

        private char peekNext() {
            if (index + 1 >= source.length()) {
                return '\0';
            }
            return source.charAt(index + 1);
        }
    }

    private record NumberExpression(double value) implements Expression {
        @Override
        public double evaluate(EvaluationContext context) {
            return value;
        }

        @Override
        public Set<String> currentDependencies() {
            return Set.of();
        }
    }

    private record VariableExpression(String name) implements Expression {
        @Override
        public double evaluate(EvaluationContext context) {
            return context.currentValue(name);
        }

        @Override
        public Set<String> currentDependencies() {
            return Set.of(name);
        }
    }

    private record LagExpression(String name) implements Expression {
        @Override
        public double evaluate(EvaluationContext context) {
            return context.lagValue(name);
        }

        @Override
        public Set<String> currentDependencies() {
            return Set.of();
        }
    }

    private record DiffExpression(String name) implements Expression {
        @Override
        public double evaluate(EvaluationContext context) {
            return context.currentValue(name) - context.lagValue(name);
        }

        @Override
        public Set<String> currentDependencies() {
            return Set.of(name);
        }
    }

    private record UnaryMinusExpression(Expression inner) implements Expression {
        @Override
        public double evaluate(EvaluationContext context) {
            return -inner.evaluate(context);
        }

        @Override
        public Set<String> currentDependencies() {
            return inner.currentDependencies();
        }
    }

    private record IfExpression(Expression condition, Expression whenTrue, Expression whenFalse) implements Expression {
        @Override
        public double evaluate(EvaluationContext context) {
            return truthy(condition.evaluate(context)) ? whenTrue.evaluate(context) : whenFalse.evaluate(context);
        }

        @Override
        public Set<String> currentDependencies() {
            Set<String> dependencies = new LinkedHashSet<>(condition.currentDependencies());
            dependencies.addAll(whenTrue.currentDependencies());
            dependencies.addAll(whenFalse.currentDependencies());
            return Set.copyOf(dependencies);
        }
    }

    private record UnaryFunctionExpression(String functionName, Expression argument) implements Expression {
        @Override
        public double evaluate(EvaluationContext context) {
            double value = argument.evaluate(context);
            return switch (functionName) {
                case "exp" -> Math.exp(value);
                case "log" -> Math.log(value);
                case "abs" -> Math.abs(value);
                case "sqrt" -> Math.sqrt(value);
                default -> throw new IllegalStateException("Unsupported function: " + functionName);
            };
        }

        @Override
        public Set<String> currentDependencies() {
            return argument.currentDependencies();
        }
    }

    private record BinaryFunctionExpression(String functionName, Expression first, Expression second) implements Expression {
        @Override
        public double evaluate(EvaluationContext context) {
            double left = first.evaluate(context);
            double right = second.evaluate(context);
            return switch (functionName) {
                case "min" -> Math.min(left, right);
                case "max" -> Math.max(left, right);
                default -> throw new IllegalStateException("Unsupported function: " + functionName);
            };
        }

        @Override
        public Set<String> currentDependencies() {
            Set<String> dependencies = new LinkedHashSet<>(first.currentDependencies());
            dependencies.addAll(second.currentDependencies());
            return Set.copyOf(dependencies);
        }
    }

    private record BinaryExpression(Expression left, Expression right, TokenType operator) implements Expression {
        @Override
        public double evaluate(EvaluationContext context) {
            double leftValue = left.evaluate(context);
            double rightValue = right.evaluate(context);
            return switch (operator) {
                case PLUS -> leftValue + rightValue;
                case MINUS -> leftValue - rightValue;
                case STAR -> leftValue * rightValue;
                case SLASH -> leftValue / rightValue;
                case CARET -> Math.pow(leftValue, rightValue);
                case GT -> truthy(leftValue > rightValue);
                case GTE -> truthy(leftValue >= rightValue);
                case LT -> truthy(leftValue < rightValue);
                case LTE -> truthy(leftValue <= rightValue);
                case EQEQ -> truthy(Math.abs(leftValue - rightValue) < 1e-12);
                case NEQ -> truthy(Math.abs(leftValue - rightValue) >= 1e-12);
                case ANDAND -> truthy(truthy(leftValue) && truthy(rightValue));
                case OROR -> truthy(truthy(leftValue) || truthy(rightValue));
                default -> throw new IllegalStateException("Unsupported operator: " + operator);
            };
        }

        @Override
        public Set<String> currentDependencies() {
            Set<String> dependencies = new LinkedHashSet<>(left.currentDependencies());
            dependencies.addAll(right.currentDependencies());
            return Set.copyOf(dependencies);
        }
    }

    private static boolean truthy(double value) {
        return Math.abs(value) > 1e-15;
    }

    private static double truthy(boolean value) {
        return value ? 1.0 : 0.0;
    }
}
