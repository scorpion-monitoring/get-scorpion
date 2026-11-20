// Builds events.jsonld, the Bioschemas markup of the upcoming events that ELIXIR TeSS harvests
// (docs/plan.md §4). Pure functions over validated events (src/lib/events.ts), in English:
// - `training`: a schema.org Course (Bioschemas Course 1.0-RELEASE) with one CourseInstance
//   (CourseInstance 1.0-RELEASE) for its dates, place and courseMode;
// - every other type: a schema.org Event (Bioschemas Event 0.3-DRAFT, the only version there is)
//   with the eventType from the profile's controlled vocabulary.
//
// Every node has `dct:conformsTo` its profile and a stable `@id` on our site,
// https://scorpion.bi.denbi.de/#event-<id> (the Course of a training: #course-<id>). Its `url` is the
// event's page, or its card on the landing page (`eventUrl()`), which is what TeSS deduplicates by.
//
// Imports only jsonld.ts and events.ts, so build-events.mjs can load it (Node strips the types).
// scripts/lib/event-profiles.mjs checks the result against the vendored profile schemas.
import { JSONLD_CONTEXT } from './jsonld.ts';
import {
  SITE_URL,
  anchorId,
  eventUrl,
  type EventType,
  type FeedEvent,
  type Organisation,
} from './events.ts';

export const EVENT_PROFILE = 'https://bioschemas.org/profiles/Event/0.3-DRAFT';
export const COURSE_PROFILE = 'https://bioschemas.org/profiles/Course/1.0-RELEASE';
export const COURSE_INSTANCE_PROFILE = 'https://bioschemas.org/profiles/CourseInstance/1.0-RELEASE';

/**
 * The Event profile's eventType vocabulary (listed in Event 0.1-DRAFT and 0.2-DRAFT; 0.3-DRAFT
 * refers to it). TeSS uses the same four. Hackathons are "workshops and courses", as TeSS lists
 * nearly all of them (checked 2026-11-20), plus the keyword `hackathon`.
 */
export const EVENT_TYPE_TERMS: Record<Exclude<EventType, 'training'>, string> = {
  hackathon: 'workshops and courses',
  workshop: 'workshops and courses',
  meeting: 'meetings and conferences',
  conference: 'meetings and conferences',
};

/** The `@id` of an event's Event or CourseInstance node. */
export function nodeId(event: Pick<FeedEvent, 'id'>): string {
  return `${SITE_URL}#${anchorId(event.id)}`;
}

/** The `@id` of a training's Course node. */
export function courseId(event: Pick<FeedEvent, 'id'>): string {
  return `${SITE_URL}#course-${event.id}`;
}

function conformsTo(profile: string) {
  return { '@id': profile, '@type': 'CreativeWork' };
}

function organisation(org: Organisation) {
  return {
    '@type': 'Organization',
    ...(org.ror ? { '@id': org.ror, identifier: org.ror } : {}),
    name: org.name,
    ...(org.url ? { url: org.url } : {}),
  };
}

function contact(event: FeedEvent) {
  const { name, email, url } = event.contact;
  return {
    '@type': 'Organization',
    name,
    ...(email ? { email } : {}),
    ...(url ? { url } : {}),
  };
}

/** A Place with a PostalAddress when `address` is given, otherwise the text of `location`. */
function location(event: FeedEvent) {
  const a = event.address;
  if (!a) return event.location;
  return {
    '@type': 'Place',
    name: a.venue ?? event.location,
    address: {
      '@type': 'PostalAddress',
      ...(a.street ? { streetAddress: a.street } : {}),
      ...(a.postalCode ? { postalCode: a.postalCode } : {}),
      addressLocality: a.locality,
      addressCountry: a.country,
    },
  };
}

/** Comma-separated, as both profiles expect one text; TeSS splits it again. */
function keywords(event: FeedEvent): string | undefined {
  const list = [...(event.keywords ?? [])];
  if (event.type === 'hackathon' && !list.some((k) => k.trim().toLowerCase() === 'hackathon')) {
    list.push('hackathon');
  }
  return list.length > 0 ? list.map((k) => k.trim()).join(', ') : undefined;
}

/** What Event and CourseInstance share: dates, place, people, registration, capacity. */
function occurrence(event: FeedEvent) {
  return {
    name: event.title.en,
    description: event.summary.en,
    url: eventUrl(event),
    startDate: event.start,
    endDate: event.end,
    location: location(event),
    inLanguage: event.language ?? 'en',
    organizer: organisation(event.host),
    hostInstitution: organisation(event.host),
    contact: contact(event),
    ...(event.registration ? { offers: { '@type': 'Offer', url: event.registration } } : {}),
    ...(event.capacity ? { maximumAttendeeCapacity: event.capacity } : {}),
  };
}

/** The node of one event, without `@context`: an Event, or a Course with its CourseInstance. */
export function eventNode(event: FeedEvent): Record<string, unknown> {
  const words = keywords(event);
  if (event.type === 'training') {
    return {
      '@type': 'Course',
      '@id': courseId(event),
      'dct:conformsTo': conformsTo(COURSE_PROFILE),
      name: event.title.en,
      description: event.summary.en,
      keywords: words,
      url: eventUrl(event),
      provider: organisation(event.host),
      hasCourseInstance: {
        '@type': 'CourseInstance',
        '@id': nodeId(event),
        'dct:conformsTo': conformsTo(COURSE_INSTANCE_PROFILE),
        ...occurrence(event),
        courseMode: event.mode,
      },
    };
  }
  return {
    '@type': 'Event',
    '@id': nodeId(event),
    'dct:conformsTo': conformsTo(EVENT_PROFILE),
    ...occurrence(event),
    eventType: { '@type': 'DefinedTerm', name: EVENT_TYPE_TERMS[event.type] },
    ...(words ? { keywords: words } : {}),
  };
}

/**
 * events.jsonld: one JSON-LD document with every given event that isn't opted out of TeSS
 * (`tess: false`), in the given order. Pass the upcoming events (buildFeed in build-events.mjs).
 */
export function eventsJsonLd(events: readonly FeedEvent[]) {
  return {
    '@context': JSONLD_CONTEXT,
    '@graph': events.filter((event) => event.tess !== false).map(eventNode),
  };
}
