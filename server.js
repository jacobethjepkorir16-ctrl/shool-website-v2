const express = require("express");
const mysql = require("mysql2");
const path = require("path");
const session = require("express-session");

const app = express();
const PORT = 3000;
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

//session management
app.use(session({
    secret: "your-secret-key",
    resave: false,
    saveUninitialized: true
}));

// Make the signed-in user available to every EJS view.
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

// Allow the server to read form data
app.use(express.urlencoded({ extended: true }));


// Serve HTML and CSS files
app.use(express.static("public"));

// MySQL connection
const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "jacobeth2005",
    database: "school_three"
});

// Test MySQL connection
db.connect((err) => {
    if (err) {
        console.log("MySQL connection failed:", err.message);
        return;
    }

    console.log("MySQL connected successfully!");
});

// Home page


app.get("/", (req, res) => {
    res.render("index.ejs");
});
// About page
app.get("/about", (req, res) => {
    res.render("about.ejs");
});
// Get students
app.get("/students", (req, res) => {

    const sql = "SELECT * FROM student";

    db.query(sql, (err, results) => {

        if (err) {
            console.log("STUDENTS ERROR:", err);
            return res.status(500).send(
                "Database error: " + err.message
            );
        }else { 
            const SqL = "SELECT * FROM classroom";
            db.query(SqL, (err, classroomResults) => {
                if (err) {
                    console.log("CLASSROOMS ERROR:", err);
                    return res.status(500).send(
                        "Database error: " + err.message
                    );
                }

                res.render("students.ejs", { students: results, classrooms: classroomResults });
            });
        }
    });
});
// Get fee structure
app.get("/fee", (req, res) => {
    res.render("fee.ejs");
});
// Contact page
app.get("/contact", (req, res) => {
    res.render("contact.ejs");
});
// Get subjects
app.get("/subjects", (req, res) => {

    const sql = "SELECT * FROM subjects";

    db.query(sql, (err, results) => {

        if (err) {
            console.log("SUBJECTS ERROR:", err);
            return res.status(500).send(
                "Database error: " + err.message
            );
        }

        res.render("subjects.ejs", { subjects: results });
    });
});

// Get results / marks for the signed-in user's role
app.get("/results", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/login");
    }

    const user = req.session.user;
    let sql = `
        SELECT marks.mark_id, marks.student_id, marks.subject_id, marks.marks,
               student.student_name, subjects.subject_name, classroom.classroom_name
        FROM marks
        JOIN student ON student.student_id = marks.student_id
        LEFT JOIN subjects ON subjects.subject_id = marks.subject_id
        LEFT JOIN classroom ON classroom.classroom_id = student.classroom_id
    `;
    let params = [];

    if (user.role === "student") {
        sql += " WHERE marks.student_id = ?";
        params = [user.student_id];
    } else if (user.role === "teacher") {
        sql += `
            WHERE student.classroom_id IN (
                SELECT classroom_id FROM class_teachers WHERE teacher_id = ?
                UNION
                SELECT classroom_id FROM teacher_subjects WHERE teacher_id = ?
            )
        `;
        params = [user.id, user.id];
    }

    sql += " ORDER BY student.student_name, marks.mark_id";

    db.query(sql, params, (err, results) => {

        if (err) {
            console.log("RESULTS ERROR:", err);
            return res.status(500).send(
                "Database error: " + err.message
            );
        }

        res.render("results.ejs", { results, user });
    });
});

// Open the admin marks entry page
app.get("/admin/marks", requireAdmin, (req, res) => {
    const studentsSql = "SELECT student_id, student_name FROM student ORDER BY student_name";
    const subjectsSql = "SELECT subject_id, subject_name FROM subjects ORDER BY subject_name";
    const marksSql = `
        SELECT marks.mark_id, marks.student_id, marks.subject_id,
               marks.marks, student.student_name, subjects.subject_name
        FROM marks
        LEFT JOIN student ON student.student_id = marks.student_id
        LEFT JOIN subjects ON subjects.subject_id = marks.subject_id
        ORDER BY marks.mark_id DESC
    `;

    db.query(studentsSql, (studentsErr, students) => {
        if (studentsErr) {
            return res.status(500).send("Database error: " + studentsErr.message);
        }

        db.query(subjectsSql, (subjectsErr, subjects) => {
            if (subjectsErr) {
                return res.status(500).send("Database error: " + subjectsErr.message);
            }

            db.query(marksSql, (marksErr, marks) => {
                if (marksErr) {
                    return res.status(500).send("Database error: " + marksErr.message);
                }

                res.render("adminmarks.ejs", { students, subjects, marks });
            });
        });
    });
});

// Record marks for one student and subject
app.post("/addMark", requireAdmin, (req, res) => {
    const { mark_id, student_id, subject_id, marks } = req.body;
    const score = Number(marks);

    if (!mark_id || !student_id || !subject_id || marks === "" || !Number.isInteger(score) || score < 0 || score > 100) {
        return res.status(400).send("Enter a mark ID, student, subject, and a score from 0 to 100.");
    }

    const sql = `
        INSERT INTO marks (mark_id, student_id, subject_id, marks)
        VALUES (?, ?, ?, ?)
    `;

    db.query(sql, [mark_id, student_id, subject_id, score], (err) => {
        if (err) {
            return res.status(500).send("Error recording marks: " + err.message);
        }

        res.redirect("/admin/marks");
    });
});
// create a route for the login page
app.get("/login", (req, res) => {
    if (req.session.user) {
        return res.redirect("/dashboard");
    }

    res.render("login.ejs");
});
//create a route for the login form submission
app.post("/login", (req, res) => {
    const identifier = req.body.identifier || req.body.email;
    const password = req.body.password;
    const SQL = "SELECT * FROM users WHERE email = ? AND password = ?";

    db.query(SQL, [identifier, password], (err, results) => {
        if (err) {
            return res.status(500).send("Database error: " + err.message);
        } else if (results.length > 0) {
            req.session.user = results[0];
            return res.redirect("/dashboard");
        }

        // Students use their student ID as both login identifier and password.
        db.query(
            "SELECT student_id, student_name FROM student WHERE student_id = ?",
            [identifier],
            (studentErr, students) => {
                if (studentErr) return res.status(500).send("Database error: " + studentErr.message);
                if (students.length > 0 && String(password) === String(students[0].student_id)) {
                    req.session.user = {
                        student_id: students[0].student_id,
                        name: students[0].student_name,
                        email: String(students[0].student_id),
                        role: "student"
                    };
                    return res.redirect("/results");
                }

                res.send("Invalid login details. <a href='/login'>Try again</a>");
            }
        );
    });
});
// create a route for the dashboard page
app.get("/dashboard", (req, res) => {
    if (!req.session.user) {
        return res.redirect("/login");
    } else if(req.session.user.role === "admin") {
        db.query("SELECT * FROM classroom ORDER BY classroom_name", (err, classrooms) => {
            if (err) {
                return res.status(500).send("Database error: " + err.message);
            }

            res.render("admindash.ejs", { user: req.session.user, classrooms });
        });
    } else if (req.session.user.role === "principal") {
        res.render("principaldash.ejs", { user: req.session.user });
    } else if (req.session.user.role === "student") {
        res.redirect("/results");
    }else{
        res.render("teacherdash.ejs", { user: req.session.user });
    }
});

function requireAdmin(req, res, next) {
    if (!req.session.user) {
        return res.redirect("/login");
    }

    if (req.session.user.role !== "admin") {
        return res.status(403).send("Only an administrator can add school records.");
    }

    next();
}

// Manage class teachers and subject teachers
app.get("/admin/assignments", requireAdmin, (req, res) => {
    const teachersSql = "SELECT id, name, email FROM users WHERE role = 'teacher' ORDER BY name";
    const classroomsSql = "SELECT classroom_id, classroom_name FROM classroom ORDER BY classroom_name";
    const subjectsSql = "SELECT subject_id, subject_name FROM subjects ORDER BY subject_name";
    const classTeachersSql = `
        SELECT class_teachers.classroom_id, class_teachers.teacher_id,
               classroom.classroom_name, users.name AS teacher_name
        FROM class_teachers
        JOIN classroom ON classroom.classroom_id = class_teachers.classroom_id
        JOIN users ON users.id = class_teachers.teacher_id
        ORDER BY classroom.classroom_name
    `;
    const subjectTeachersSql = `
        SELECT teacher_subjects.teacher_id, teacher_subjects.classroom_id,
               teacher_subjects.subject_id, users.name AS teacher_name,
               classroom.classroom_name, subjects.subject_name
        FROM teacher_subjects
        JOIN users ON users.id = teacher_subjects.teacher_id
        JOIN classroom ON classroom.classroom_id = teacher_subjects.classroom_id
        JOIN subjects ON subjects.subject_id = teacher_subjects.subject_id
        ORDER BY classroom.classroom_name, subjects.subject_name
    `;

    db.query(teachersSql, (teachersErr, teachers) => {
        if (teachersErr) return res.status(500).send("Database error: " + teachersErr.message);
        db.query(classroomsSql, (classroomsErr, classrooms) => {
            if (classroomsErr) return res.status(500).send("Database error: " + classroomsErr.message);
            db.query(subjectsSql, (subjectsErr, subjects) => {
                if (subjectsErr) return res.status(500).send("Database error: " + subjectsErr.message);
                db.query(classTeachersSql, (classTeachersErr, classTeachers) => {
                    if (classTeachersErr) return res.status(500).send("Database error: " + classTeachersErr.message);
                    db.query(subjectTeachersSql, (subjectTeachersErr, subjectTeachers) => {
                        if (subjectTeachersErr) return res.status(500).send("Database error: " + subjectTeachersErr.message);
                        res.render("adminassignments.ejs", { teachers, classrooms, subjects, classTeachers, subjectTeachers });
                    });
                });
            });
        });
    });
});

app.post("/admin/assign-class-teacher", requireAdmin, (req, res) => {
    const { classroom_id, teacher_id } = req.body;
    if (!classroom_id || !teacher_id) return res.status(400).send("Classroom and teacher are required.");

    const sql = `
        INSERT INTO class_teachers (classroom_id, teacher_id)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE teacher_id = VALUES(teacher_id)
    `;
    db.query(sql, [classroom_id, teacher_id], (err) => {
        if (err) return res.status(500).send("Error assigning class teacher: " + err.message);
        res.redirect("/admin/assignments");
    });
});

app.post("/admin/assign-subject-teacher", requireAdmin, (req, res) => {
    const { teacher_id, classroom_id, subject_id } = req.body;
    if (!teacher_id || !classroom_id || !subject_id) return res.status(400).send("Teacher, classroom, and subject are required.");

    const sql = `
        INSERT IGNORE INTO teacher_subjects (teacher_id, classroom_id, subject_id)
        VALUES (?, ?, ?)
    `;
    db.query(sql, [teacher_id, classroom_id, subject_id], (err) => {
        if (err) return res.status(500).send("Error assigning subject teacher: " + err.message);
        res.redirect("/admin/assignments");
    });
});

// View teacher accounts
app.get("/admin/teachers", requireAdmin, (req, res) => {
    db.query(
        "SELECT name, email, role FROM users WHERE role = 'teacher' ORDER BY name",
        (err, teachers) => {
            if (err) {
                return res.status(500).send("Database error: " + err.message);
            }

            res.render("adminteachers.ejs", { teachers });
        }
    );
});

// View the complete student register and academic records
app.get("/admin/students", requireAdmin, (req, res) => {
    const studentsSql = `
        SELECT student.student_id, student.student_name,
               student.classroom_id, classroom.classroom_name
        FROM student
        LEFT JOIN classroom ON classroom.classroom_id = student.classroom_id
        ORDER BY student.student_name
    `;
    const marksSql = `
        SELECT marks.mark_id, marks.student_id, marks.subject_id,
               marks.marks, subjects.subject_name
        FROM marks
        LEFT JOIN subjects ON subjects.subject_id = marks.subject_id
        ORDER BY marks.student_id, marks.mark_id
    `;

    db.query(studentsSql, (studentsErr, students) => {
        if (studentsErr) {
            return res.status(500).send("Database error: " + studentsErr.message);
        }

        db.query(marksSql, (marksErr, marks) => {
            if (marksErr) {
                return res.status(500).send("Database error: " + marksErr.message);
            }

            res.render("adminstudents.ejs", {
                user: req.session.user,
                students,
                marks
            });
        });
    });
});

// View one student's complete record
app.get("/admin/students/:studentId", requireAdmin, (req, res) => {
    const studentSql = `
        SELECT student.student_id, student.student_name,
               student.classroom_id, classroom.classroom_name
        FROM student
        LEFT JOIN classroom ON classroom.classroom_id = student.classroom_id
        WHERE student.student_id = ?
    `;
    const marksSql = `
        SELECT marks.mark_id, marks.subject_id, marks.marks,
               subjects.subject_name
        FROM marks
        LEFT JOIN subjects ON subjects.subject_id = marks.subject_id
        WHERE marks.student_id = ?
        ORDER BY marks.mark_id
    `;

    db.query(studentSql, [req.params.studentId], (studentErr, students) => {
        if (studentErr) {
            return res.status(500).send("Database error: " + studentErr.message);
        }

        if (students.length === 0) {
            return res.status(404).render("404.ejs");
        }

        db.query(marksSql, [req.params.studentId], (marksErr, marks) => {
            if (marksErr) {
                return res.status(500).send("Database error: " + marksErr.message);
            }

            res.render("adminstudent.ejs", {
                user: req.session.user,
                student: students[0],
                marks
            });
        });
    });
});
// Receive contact messages
app.post("/contact", (req, res) => {

    const { name, email, message } = req.body;

    const sql = `
        INSERT INTO messages (name, email, message)
        VALUES (?, ?, ?)
    `;

    db.query(sql, [name, email, message], (err, result) => {

        if (err) {
            console.log("CONTACT ERROR:", err);
            return res.status(500).send(
                "Failed to send message: " + err.message
            );
        }

        res.send(`
            <h2>Message sent successfully!</h2>
            <p>Thank you, ${name}. We will get back to you.</p>
            <a href="/contact.html">Back to Contact</a>
        `);
    });
});

// Get received messages
app.get("/messages", requireAdmin, (req, res) => {

    const sql = "SELECT * FROM messages ORDER BY created_at DESC";

    db.query(sql, (err, results) => {

        if (err) {
            console.log("MESSAGES ERROR:", err);
            return res.status(500).send(
                "Database error: " + err.message
            );
        }

        res.render("messages.ejs", { messages: results, user: req.session.user });
    });
});

// Send a message from the admin message center
app.post("/admin/messages/send", requireAdmin, (req, res) => {
    const { name, email, message } = req.body;

    if (!name || !email || !message) {
        return res.status(400).send("Recipient name, email, and message are required.");
    }

    const sql = `
        INSERT INTO messages (name, email, message)
        VALUES (?, ?, ?)
    `;

    db.query(sql, [name, email, message], (err) => {
        if (err) {
            return res.status(500).send("Failed to send message: " + err.message);
        }

        res.redirect("/messages");
    });
});

// Reply to a message
app.post("/reply", requireAdmin, (req, res) => {

    const { message_id, reply } = req.body;

    const sql = `
        UPDATE messages
        SET reply = ?
        WHERE message_id = ?
    `;

    db.query(sql, [reply, message_id], (err, result) => {

        if (err) {
            console.log("REPLY ERROR:", err);
            return res.status(500).send(
                "Failed to save reply: " + err.message
            );
        }

        res.redirect("/messages");
    });
});
//add student
app.post("/addStudent", requireAdmin, (req, res) => {
    const sql = `
        INSERT INTO student (student_id, student_name, classroom_id)
        VALUES (?, ?, ?)
    `;
    db.query(sql, [req.body.student_id, req.body.student_name, req.body.classroom_id], (err, result) => {

        if (err) {
            res.status(500).send("Error adding student: " + err.message);
        }else {
            res.redirect("/students");
        }
    });
});

// Add a classroom
app.post("/addClassroom", requireAdmin, (req, res) => {
    const { classroom_id, classroom_name } = req.body;

    if (!classroom_id || !classroom_name) {
        return res.status(400).send("Classroom ID and classroom name are required.");
    }

    const sql = `
        INSERT INTO classroom (classroom_id, classroom_name)
        VALUES (?, ?)
    `;

    db.query(sql, [classroom_id, classroom_name], (err) => {
        if (err) {
            return res.status(500).send("Error adding classroom: " + err.message);
        }

        res.redirect("/dashboard");
    });
});

// Add a subject
app.post("/addSubject", requireAdmin, (req, res) => {
    const { subject_id, subject_name } = req.body;

    if (!subject_id || !subject_name) {
        return res.status(400).send("Subject ID and subject name are required.");
    }

    const sql = `
        INSERT INTO subjects (subject_id, subject_name)
        VALUES (?, ?)
    `;

    db.query(sql, [subject_id, subject_name], (err) => {
        if (err) {
            return res.status(500).send("Error adding subject: " + err.message);
        }

        res.redirect("/dashboard");
    });
});

// Add a login account with an administrator-selected role
app.post("/addTeacher", requireAdmin, (req, res) => {
    const { name, email, password, role } = req.body;
    const allowedRoles = ["admin", "principal", "teacher", "student"];

    if (!name || !email || !password || !allowedRoles.includes(role)) {
        return res.status(400).send("Name, email, password, and a valid role are required.");
    }

    const sql = `
        INSERT INTO users (name, email, password, role)
        VALUES (?, ?, ?, ?)
    `;

    db.query(sql, [name, email, password, role], (err) => {
        if (err) {
            return res.status(500).send("Error adding account: " + err.message);
        }

        res.redirect("/admin/teachers");
    });
});

// destroy session and logout
app.get("/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.log("LOGOUT ERROR:", err);
            return res.status(500).send("Failed to logout.");
        }
        res.redirect("/login");
    });
});
// 404 route
app.use((req, res) => {
    res.status(404).render("404.ejs");
});
// Start server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
