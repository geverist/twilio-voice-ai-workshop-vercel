/**
 * Track Student Progress (Vercel API)
 *
 * This function tracks student progress through workshop exercises.
 * Uses Vercel Postgres to store progress data persistently.
 *
 * Endpoints:
 * - POST: Record progress for a student
 * - GET: Retrieve progress for a student or all students (instructors only)
 *
 * Progress Data Structure:
 * {
 *   studentId: "email@example.com",
 *   studentName: "John Doe",
 *   exercises: {
 *     "exercise-1": { completed: true, timestamp: "2025-01-15T10:30:00Z", timeSpent: 120 },
 *     "exercise-2": { completed: false, attempts: 3, lastAttempt: "2025-01-15T11:00:00Z" }
 *   },
 *   startedAt: "2025-01-15T10:00:00Z",
 *   lastActivity: "2025-01-15T11:30:00Z",
 *   totalTimeSpent: 5400,
 *   completionRate: 33
 * }
 */

import postgres from 'postgres';
import { applyCORS, handlePreflightRequest } from './_lib/cors.js';

// Create postgres connection
const sql = postgres(process.env.POSTGRES_URL, {
  ssl: 'require',
  max: 1
});

export default async function handler(req, res) {
  // Apply CORS
  applyCORS(req, res);

  // Handle preflight
  if (handlePreflightRequest(req, res)) {
    return;
  }

  try {
    // Check if Postgres is configured
    if (!process.env.POSTGRES_URL) {
      return res.status(500).json({
        success: false,
        error: 'Database not configured. Please set POSTGRES_URL in environment variables.'
      });
    }

    // GET: Retrieve progress data
    if (req.method === 'GET') {
      const { studentId, getAllStudents } = req.query;

      // Get all students (for instructor dashboard)
      if (getAllStudents === 'true') {
        try {
          const result = await sql`
            SELECT
              student_email as "studentId",
              student_name as "studentName",
              exercises,
              started_at as "startedAt",
              last_activity as "lastActivity",
              total_time_spent as "totalTimeSpent",
              completion_rate as "completionRate",
              repo_created as "repoCreated",
              demo_mode as "demoMode"
            FROM workshop_students
            ORDER BY last_activity DESC
            LIMIT 100
          `;

          return res.status(200).json({
            success: true,
            students: result,
            count: result.length
          });
        } catch (error) {
          console.error('Error fetching all students:', error);
          return res.status(500).json({
            success: false,
            error: 'Failed to fetch student progress',
            details: error.message
          });
        }
      }

      // Get specific student progress
      if (!studentId) {
        return res.status(400).json({
          success: false,
          error: 'studentId parameter is required'
        });
      }

      try {
        const result = await sql`
          SELECT
            student_email as "studentId",
            student_name as "studentName",
            exercises,
            started_at as "startedAt",
            last_activity as "lastActivity",
            total_time_spent as "totalTimeSpent",
            completion_rate as "completionRate",
            repo_created as "repoCreated",
            demo_mode as "demoMode"
          FROM workshop_students
          WHERE student_email = ${studentId}
        `;

        if (result.length === 0) {
          // Student not found - return empty progress
          return res.status(200).json({
            success: true,
            progress: {
              studentId,
              exercises: {},
              startedAt: null,
              lastActivity: null,
              totalTimeSpent: 0,
              completionRate: 0,
              repoCreated: false
            }
          });
        }

        return res.status(200).json({
          success: true,
          progress: result[0]
        });

      } catch (error) {
        console.error('Error fetching student progress:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to fetch student progress',
          details: error.message
        });
      }
    }

    // POST: Update progress
    if (req.method === 'POST') {
      const {
        studentId,
        studentName,
        exerciseId,
        completed,
        timeSpent,
        attempts,
        totalExercises,
        repoCreated,
        demoMode
      } = req.body;

      if (!studentId || !exerciseId) {
        return res.status(400).json({
          success: false,
          error: 'studentId and exerciseId are required'
        });
      }

      const timestamp = new Date().toISOString();

      try {
        // Try to fetch existing student
        const existingStudent = await sql`
          SELECT * FROM workshop_students
          WHERE student_email = ${studentId}
        `;

        let progressData;

        if (existingStudent.length === 0) {
          // Create new student record
          progressData = {
            exercises: {
              [exerciseId]: {
                completed: completed || false,
                timestamp: completed ? timestamp : null,
                timeSpent: timeSpent || 0,
                attempts: attempts || 1,
                lastAttempt: timestamp
              }
            }
          };

          await sql`
            INSERT INTO workshop_students
            (student_email, student_name, exercises, started_at, last_activity, total_time_spent, completion_rate, repo_created, demo_mode)
            VALUES (
              ${studentId},
              ${studentName || studentId},
              ${JSON.stringify(progressData.exercises)},
              ${timestamp},
              ${timestamp},
              ${timeSpent || 0},
              ${totalExercises ? Math.round((completed ? 1 : 0) / totalExercises * 100) : 0},
              ${repoCreated || false},
              ${demoMode || false}
            )
          `;

          return res.status(200).json({
            success: true,
            message: 'Progress recorded successfully',
            progress: {
              studentId,
              studentName: studentName || studentId,
              exercises: progressData.exercises,
              startedAt: timestamp,
              lastActivity: timestamp,
              totalTimeSpent: timeSpent || 0,
              completionRate: totalExercises ? Math.round((completed ? 1 : 0) / totalExercises * 100) : 0,
              repoCreated: repoCreated || false
            }
          });
        }

        // Update existing student
        const student = existingStudent[0];
        progressData = student.exercises || {};

        // Update exercise progress
        const existingExercise = progressData[exerciseId] || {};
        progressData[exerciseId] = {
          completed: completed !== undefined ? completed : existingExercise.completed,
          timestamp: completed ? timestamp : existingExercise.timestamp,
          timeSpent: timeSpent || existingExercise.timeSpent || 0,
          attempts: attempts !== undefined ? attempts : (existingExercise.attempts || 0) + 1,
          lastAttempt: timestamp
        };

        // Calculate total time spent
        const newTotalTimeSpent = Object.values(progressData)
          .reduce((sum, ex) => sum + (ex.timeSpent || 0), 0);

        // Calculate completion rate
        const completedCount = Object.values(progressData)
          .filter(ex => ex.completed).length;
        const total = totalExercises || 9; // Default to 9 exercises
        const newCompletionRate = Math.round((completedCount / total) * 100);

        // Update the database
        await sql`
          UPDATE workshop_students
          SET
            student_name = ${studentName || student.student_name},
            exercises = ${JSON.stringify(progressData)},
            last_activity = ${timestamp},
            total_time_spent = ${newTotalTimeSpent},
            completion_rate = ${newCompletionRate},
            repo_created = ${repoCreated !== undefined ? repoCreated : student.repo_created},
            demo_mode = ${demoMode !== undefined ? demoMode : student.demo_mode}
          WHERE student_email = ${studentId}
        `;

        return res.status(200).json({
          success: true,
          message: 'Progress updated successfully',
          progress: {
            studentId,
            studentName: studentName || student.student_name,
            exercises: progressData,
            startedAt: student.started_at,
            lastActivity: timestamp,
            totalTimeSpent: newTotalTimeSpent,
            completionRate: newCompletionRate,
            repoCreated: repoCreated !== undefined ? repoCreated : student.repo_created
          }
        });

      } catch (error) {
        console.error('Error updating progress:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to update progress',
          details: error.message
        });
      }
    }

    // DELETE: Remove a student
    if (req.method === 'DELETE') {
      const { studentId } = req.body;

      if (!studentId) {
        return res.status(400).json({
          success: false,
          error: 'studentId is required'
        });
      }

      try {
        const result = await sql`
          DELETE FROM workshop_students
          WHERE student_email = ${studentId}
        `;

        if (result.rowCount === 0) {
          return res.status(404).json({
            success: false,
            error: 'Student not found'
          });
        }

        return res.status(200).json({
          success: true,
          message: `Student ${studentId} deleted successfully`
        });

      } catch (error) {
        console.error('Error deleting student:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to delete student',
          details: error.message
        });
      }
    }

    // Invalid method
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use GET, POST, or DELETE.'
    });

  } catch (error) {
    console.error('Error in track-student-progress:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message
    });
  }
}
