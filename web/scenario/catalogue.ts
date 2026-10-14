import * as pilot from "./content.ts";
import { findVariant } from "./variants.ts";
import { cafeCourse, directionsCourse, shoppingCourse } from "./courses.ts";
import type { ScenarioDefinition } from "./content.ts";
import {
  introductionsCourse,
  transitCourse,
  hotelCourse,
  weekendCourse,
} from "./courses-conversation.ts";
import {
  rescheduleCourse,
  cafeChangesCourse,
  exchangeCourse,
  clarificationCourse,
} from "./courses-adaptation.ts";

const introductoryCourses: ScenarioDefinition[] = [
  {
    id: pilot.scenarioId,
    title: pilot.scenarioTitle,
    objective: "接受邀请、婉拒并提出其他时间，读懂见面安排。",
    listeningHeading: "朋友之间的一段对话",
    listeningFocus: "邀请、时间和地点",
    readingFocus: "见面时间和路程",
    readingWords: ["駅", "予約", "七時半"],
    transferFocus: "换时间、地点和活动",
    dialogue: pilot.dialogue,
    listeningQuestions: pilot.listeningQuestions,
    expressions: pilot.expressions,
    responsePrompts: pilot.responsePrompts,
    transferPrompt: pilot.transferPrompt,
    readingMessage: pilot.readingMessage,
    readingQuestions: pilot.readingQuestions,
    readingSender: "友人",
    readingLabel: "今晚 20:10",
  },
  cafeCourse,
  directionsCourse,
  shoppingCourse,
];

export interface CourseUnit {
  id: string;
  title: string;
  focus: string;
  courses: ScenarioDefinition[];
}

export const courseUnits: CourseUnit[] = [
  {
    id: "everyday",
    title: "第一阶段 · 日常入门",
    focus: "邀请、点单、问路、购物",
    courses: introductoryCourses,
  },
  {
    id: "conversation",
    title: "第二阶段 · 接续交流",
    focus: "介绍、追问、确认、分工",
    courses: [introductionsCourse, transitCourse, hotelCourse, weekendCourse],
  },
  {
    id: "adaptation",
    title: "第三阶段 · 处理变化",
    focus: "改期、替换、协商、澄清",
    courses: [
      rescheduleCourse,
      cafeChangesCourse,
      exchangeCourse,
      clarificationCourse,
    ],
  },
];

export const scenarioCourses = courseUnits.flatMap((unit) => unit.courses);

export function getCourseUnit(lessonId: string): CourseUnit {
  const unit = courseUnits.find((item) =>
    item.courses.some((course) => course.id === lessonId),
  );
  if (!unit) throw new Error(`Unknown scenario: ${lessonId}`);
  return unit;
}

export function getScenario(id: string): ScenarioDefinition {
  const course =
    scenarioCourses.find((item) => item.id === id) ?? findVariant(id);
  if (!course) throw new Error(`Unknown scenario: ${id}`);
  return course;
}
