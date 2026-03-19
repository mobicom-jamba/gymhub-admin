"use client";

import React, { useEffect, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventInput, EventClickArg, EventContentArg } from "@fullcalendar/core";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";

type Schedule = {
  id: string;
  start_time: string;
  end_time: string;
  is_cancelled: boolean;
  classes?: { title?: string | null; gyms?: { name?: string | null } | null } | null;
};

export default function GymHubCalendar() {
  const [events, setEvents] = useState<EventInput[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    supabase
      .from("class_schedules")
      .select("id, start_time, end_time, is_cancelled, classes!inner(title, gyms(name))")
      .gte("start_time", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order("start_time")
      .limit(500)
      .then(({ data, error }) => {
        if (error) {
          console.error(error);
          setLoading(false);
          return;
        }
        const evts: EventInput[] = ((data ?? []) as Schedule[]).map((s) => {
          const c = Array.isArray(s.classes) ? s.classes[0] : s.classes;
          const g = Array.isArray(c?.gyms) ? c?.gyms[0] : c?.gyms;
          const title = `${c?.title ?? "Хичээл"} (${g?.name ?? ""})`;
          return {
            id: s.id,
            title: s.is_cancelled ? `[Цуцлагдсан] ${title}` : title,
            start: s.start_time,
            end: s.end_time,
            extendedProps: {
              cancelled: s.is_cancelled,
              scheduleId: s.id,
            },
          };
        });
        setEvents(evts);
        setLoading(false);
      });
  }, []);

  const handleEventClick = (clickInfo: EventClickArg) => {
    const id = clickInfo.event.extendedProps.scheduleId;
    if (id) window.location.href = `/schedules?highlight=${id}`;
  };

  const renderEventContent = (eventInfo: EventContentArg) => {
    const cancelled = eventInfo.event.extendedProps.cancelled;
    return (
      <div
        className={`fc-event-main p-1 rounded-sm ${cancelled ? "opacity-60 line-through" : ""}`}
      >
        <div className="fc-event-time">{eventInfo.timeText}</div>
        <div className="fc-event-title">{eventInfo.event.title}</div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center text-gray-500 dark:border-gray-800 dark:bg-white/[0.03]">
        Уншиж байна...
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="custom-calendar">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek,timeGridDay",
          }}
          events={events}
          eventClick={handleEventClick}
          eventContent={renderEventContent}
          locale="mn"
        />
      </div>
    </div>
  );
}
