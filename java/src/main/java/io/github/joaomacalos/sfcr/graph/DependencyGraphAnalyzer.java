package io.github.joaomacalos.sfcr.graph;

import io.github.joaomacalos.sfcr.model.Equation;
import io.github.joaomacalos.sfcr.parser.Expression;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public final class DependencyGraphAnalyzer {
    public List<EquationBlock> orderedBlocks(List<Equation> equations, Map<String, Expression> parsedExpressions) {
        Map<String, Set<String>> dependencies = new LinkedHashMap<>();
        Set<String> endogenous = equations.stream().map(Equation::name).collect(LinkedHashSet::new, Set::add, Set::addAll);

        for (Equation equation : equations) {
            Set<String> refs = new LinkedHashSet<>(parsedExpressions.get(equation.name()).currentDependencies());
            refs.retainAll(endogenous);
            dependencies.put(equation.name(), refs);
        }

        List<Set<String>> components = stronglyConnectedComponents(dependencies);
        Map<String, Integer> componentIndex = new HashMap<>();
        for (int i = 0; i < components.size(); i++) {
            for (String variable : components.get(i)) {
                componentIndex.put(variable, i);
            }
        }

        Map<Integer, Set<Integer>> dag = new HashMap<>();
        Map<Integer, Integer> indegree = new HashMap<>();
        for (int i = 0; i < components.size(); i++) {
            dag.put(i, new LinkedHashSet<>());
            indegree.put(i, 0);
        }

        for (Map.Entry<String, Set<String>> entry : dependencies.entrySet()) {
            int from = componentIndex.get(entry.getKey());
            for (String dep : entry.getValue()) {
                int to = componentIndex.get(dep);
                if (from != to && dag.get(to).add(from)) {
                    indegree.put(from, indegree.get(from) + 1);
                }
            }
        }

        Deque<Integer> queue = new ArrayDeque<>();
        indegree.entrySet().stream()
            .filter(entry -> entry.getValue() == 0)
            .map(Map.Entry::getKey)
            .sorted()
            .forEach(queue::addLast);

        List<EquationBlock> ordered = new ArrayList<>();
        while (!queue.isEmpty()) {
            int component = queue.removeFirst();
            List<String> variables = components.get(component).stream().sorted().toList();
            ordered.add(new EquationBlock(variables));
            for (int next : dag.get(component)) {
                indegree.put(next, indegree.get(next) - 1);
                if (indegree.get(next) == 0) {
                    queue.addLast(next);
                }
            }
        }

        if (ordered.size() != components.size()) {
            throw new IllegalStateException("Dependency graph ordering failed");
        }
        return ordered;
    }

    private List<Set<String>> stronglyConnectedComponents(Map<String, Set<String>> graph) {
        Tarjan tarjan = new Tarjan(graph);
        return tarjan.run().stream()
            .sorted(Comparator.comparing(component -> component.stream().sorted().findFirst().orElse("")))
            .toList();
    }

    private static final class Tarjan {
        private final Map<String, Set<String>> graph;
        private final Map<String, Integer> indexByNode = new HashMap<>();
        private final Map<String, Integer> lowLinkByNode = new HashMap<>();
        private final Deque<String> stack = new ArrayDeque<>();
        private final Set<String> onStack = new HashSet<>();
        private final List<Set<String>> result = new ArrayList<>();
        private int index;

        private Tarjan(Map<String, Set<String>> graph) {
            this.graph = graph;
        }

        private List<Set<String>> run() {
            for (String node : graph.keySet()) {
                if (!indexByNode.containsKey(node)) {
                    visit(node);
                }
            }
            return result;
        }

        private void visit(String node) {
            indexByNode.put(node, index);
            lowLinkByNode.put(node, index);
            index++;
            stack.push(node);
            onStack.add(node);

            for (String neighbor : graph.getOrDefault(node, Set.of())) {
                if (!indexByNode.containsKey(neighbor)) {
                    visit(neighbor);
                    lowLinkByNode.put(node, Math.min(lowLinkByNode.get(node), lowLinkByNode.get(neighbor)));
                } else if (onStack.contains(neighbor)) {
                    lowLinkByNode.put(node, Math.min(lowLinkByNode.get(node), indexByNode.get(neighbor)));
                }
            }

            if (lowLinkByNode.get(node).equals(indexByNode.get(node))) {
                Set<String> component = new LinkedHashSet<>();
                String current;
                do {
                    current = stack.pop();
                    onStack.remove(current);
                    component.add(current);
                } while (!current.equals(node));
                result.add(component);
            }
        }
    }
}
