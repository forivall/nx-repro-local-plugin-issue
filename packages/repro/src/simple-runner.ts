import {
  createProjectGraphAsync,
  ExecutorContext,
  logger,
  ProjectGraph,
  runExecutor,
  workspaceRoot,
  Workspaces,
} from '@nrwl/devkit';
import type {
  defaultTasksRunner,
  DefaultTasksRunnerOptions,
  Task,
  TaskGraph,
} from '@nrwl/devkit';
import _ from 'lodash';

type LifeCycle = DefaultTasksRunnerOptions['lifeCycle'];
type TaskStatus = Parameters<
  NonNullable<LifeCycle['printTaskTerminalOutput']>
>[1];

type TasksRunnerContextBase = NonNullable<
  Parameters<typeof defaultTasksRunner>[2]
>;
interface TasksRunnerContext extends TasksRunnerContextBase {
  projectGraph: NonNullable<TasksRunnerContextBase['projectGraph']>;
  nxJson: NonNullable<TasksRunnerContextBase['nxJson']>;
  nxArgs: NonNullable<TasksRunnerContextBase['nxArgs']>;
  taskGraph: NonNullable<TasksRunnerContextBase['taskGraph']>;
}

type TasksRunner<T> = (
  tasks: Task[],
  options: T,
  context: TasksRunnerContext,
) => Promise<{ [id: string]: TaskStatus }>;

export interface SimpleTasksRunnerOptions {
  lifeCycle: Required<LifeCycle>;
}

type SimpleTasksRunner = TasksRunner<SimpleTasksRunnerOptions>;
/**
 * A simple runner for debugging nx executors, with no caching or any fancy nx internals
 *
 * Use: `node --inspect node_modules/.bin/nx run-one <task> --runner=debug`
 */
export const simpleTasksRunner: SimpleTasksRunner = async (
  tasks,
  options,
  context,
) => {
  options.lifeCycle.startCommand();
  try {
    return await runAllTasks(tasks, options, context);
  } finally {
    options.lifeCycle.endCommand();
  }
};

function updateTaskGraph(old: TaskGraph, completed: string[]): TaskGraph {
  const tasks = _.omit(old.tasks, completed);
  const taskIds = Object.keys(tasks);
  const dependencies = _.zipObject(
    taskIds,
    taskIds.map((taskId) => _.difference(old.dependencies[taskId], completed)),
  );
  const roots = taskIds.filter((taskId) => 0 === dependencies[taskId].length);
  return { dependencies, roots, tasks };
}

const runAllTasks: SimpleTasksRunner = async (tasks, options, context) => {
  const projectGraph: ProjectGraph = await createProjectGraphAsync();

  const projectsConfigurations = {
    version: 2,
    projects: _.mapValues(projectGraph.nodes, ({ data }) => data),
  };
  const nxJsonConfiguration = new Workspaces(workspaceRoot).readNxJson();

  const executorContext: ExecutorContext = {
    nxJsonConfiguration,
    projectGraph,
    projectsConfigurations,
    cwd: process.cwd(),
    isVerbose: 'true' === process.env.NX_VERBOSE_LOGGING,
    root: workspaceRoot,
    workspace: { ...projectsConfigurations, ...nxJsonConfiguration },
  };

  // TODO: load process.env - "ForkedProcessTaskRunner getEnvVariablesForTask"

  const results = _.zipObject(
    tasks.map(({ id }) => id),
    tasks.map((): TaskStatus => 'skipped'),
  );

  const todo = new Set<string>(tasks.map(({ id }) => id));
  const continuedTasks: Array<Promise<void>> = [];
  let todoTaskGraph = context.taskGraph;
  let prevSize = todo.size + 1;
  while (0 < todo.size && prevSize > todo.size) {
    prevSize = todo.size;
    const completed: string[] = [];
    for (const rootTaskId of todoTaskGraph.roots) {
      const task = todoTaskGraph.tasks[rootTaskId];
      options.lifeCycle.startTasks([task], { groupId: 0 });
      options.lifeCycle.scheduleTask(task);
      let status: TaskStatus = 'failure';
      try {
        const output = await runExecutor(
          task.target,
          task.overrides,
          executorContext,
        );
        const event = await output.next();
        const { success } = event.value as { success: boolean };
        status = success ? 'success' : 'failure';
        if (!event.done) {
          continuedTasks.push(exhaustAsyncIterator(output, event));
        }
        completed.push(task.id);
      } catch (err) {
        logger.error(err);
      }
      const code = 'success' === status ? 0 : 1;
      options.lifeCycle.endTasks([{ code, status, task }], { groupId: 0 });
      results[task.id] = status;
      todo.delete(task.id);
    }
    todoTaskGraph = updateTaskGraph(todoTaskGraph, completed);
  }
  await Promise.all(continuedTasks);
  return results;
};

async function exhaustAsyncIterator<T>(
  output: AsyncIterator<T>,
  event: Partial<IteratorResult<T>> = { done: false },
) {
  while (!event.done) {
    event = await output.next();
  }
}

export default simpleTasksRunner;
