from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, DateTime, Text, JSON
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True)
    phone_number = Column(String(32), nullable=True)
    full_name = Column(String(255))
    hashed_password = Column(String(255))
    role = Column(String(32)) 
    is_active = Column(Boolean, default=True) # If False, user is "banned/deleted" but data exists
    created_at = Column(DateTime, default=datetime.utcnow) # Know exactly when they joined
    last_login = Column(DateTime, nullable=True)
    # Google OAuth subject (stable per Google account); null for email/password-only users
    google_sub = Column(String(255), nullable=True, unique=True, index=True)
    enrollments = relationship("Enrollment", back_populates="student")
    submissions = relationship("Submission", back_populates="student")
    test_results = relationship("TestResult", back_populates="student")
    
    live_sessions = relationship("LiveSession", back_populates="instructor")


class Course(Base):
    __tablename__ = "courses"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255))
    description = Column(String(1000))
    price = Column(Integer)
    image_url = Column(String(1000), nullable=True)
    is_published = Column(Boolean, default=False)
    instructor_id = Column(Integer, ForeignKey("users.id"))
    course_type = Column(String(32), default="standard") # 'standard' or 'coding'
    language = Column(String(64), nullable=True) # e.g., 'python', 'javascript' (for compiler)
    modules = relationship("Module", back_populates="course")
    enrollments = relationship("Enrollment", back_populates="course")
    challenges = relationship("CourseChallenge", back_populates="course")
    
class Module(Base):
    __tablename__ = "modules"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255))
    order = Column(Integer)
    course_id = Column(Integer, ForeignKey("courses.id"))
    
    course = relationship("Course", back_populates="modules")
    items = relationship("ContentItem", back_populates="module")

class ContentItem(Base):
    __tablename__ = "content_items"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255))
    type = Column(String(64)) 
    content = Column(String(1000), nullable=True) 
    duration = Column(Integer, nullable=True)
    is_mandatory = Column(Boolean, default=False)
    order = Column(Integer)
    module_id = Column(Integer, ForeignKey("modules.id"))
    
    instructions = Column(Text, nullable=True) 
    test_config = Column(Text, nullable=True) 
    # Optional JSON string list of resource URLs for video lessons.
    resource_links = Column(Text, nullable=True)

    start_time = Column(DateTime, nullable=True)
    end_time = Column(DateTime, nullable=True)

    module = relationship("Module", back_populates="items")

class Enrollment(Base):
    __tablename__ = "enrollments"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    course_id = Column(Integer, ForeignKey("courses.id"))
    enrolled_at = Column(DateTime, default=datetime.utcnow)
    
    enrollment_type = Column(String(32), default="paid") 
    expiry_date = Column(DateTime, nullable=True)    
    
    student = relationship("User", back_populates="enrollments") 
    course = relationship("Course", back_populates="enrollments") 

class Submission(Base):
    __tablename__ = "submissions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    content_item_id = Column(Integer, ForeignKey("content_items.id"))
    drive_link = Column(String(1000))
    status = Column(String(32), default="Pending")
    submitted_at = Column(DateTime, default=datetime.utcnow)
    
    student = relationship("User", back_populates="submissions")
    assignment = relationship("ContentItem")

# Code arena
class CodeTest(Base):
    __tablename__ = "code_tests"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255))
    pass_key = Column(String(128))
    time_limit = Column(Integer) # In minutes
    instructor_id = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    
    problems = relationship("Problem", back_populates="test")
    results = relationship("TestResult", back_populates="test")

class Problem(Base):
    __tablename__ = "problems"
    id = Column(Integer, primary_key=True, index=True)
    test_id = Column(Integer, ForeignKey("code_tests.id"))
    title = Column(String(255))
    description = Column(Text)
    difficulty = Column(String(32))
    test_cases = Column(Text) # Stored as JSON string
    
    test = relationship("CodeTest", back_populates="problems")

class TestResult(Base):
    __tablename__ = "test_results"
    id = Column(Integer, primary_key=True, index=True)
    test_id = Column(Integer, ForeignKey("code_tests.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    score = Column(Integer)
    problems_solved = Column(Integer)
    time_taken = Column(String(64)) # "45 mins"
    submitted_at = Column(DateTime, default=datetime.utcnow)
    
    student = relationship("User", back_populates="test_results")
    test = relationship("CodeTest", back_populates="results")

class LiveSession(Base):
    __tablename__ = "live_sessions"
    id = Column(Integer, primary_key=True, index=True)
    instructor_id = Column(Integer, ForeignKey("users.id"))
    youtube_url = Column(String(1000))
    topic = Column(String(255))
    is_active = Column(Boolean, default=True)
    started_at = Column(DateTime, default=datetime.utcnow)

    instructor = relationship("User", back_populates="live_sessions")
    
class CourseChallenge(Base):
    __tablename__ = "course_challenges"
    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"))
    title = Column(String(255))
    description = Column(Text)
    difficulty = Column(String(32)) # "Easy", "Medium", "Hard"
    test_cases = Column(Text) # JSON String: [{"input": "...", "output": "...", "hidden": false}]
    function_name = Column(String(128), default="solution") # For function wrapping if needed
    
    course = relationship("Course", back_populates="challenges")
    progress = relationship("ChallengeProgress", back_populates="challenge")

class ChallengeProgress(Base):
    __tablename__ = "challenge_progress"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    challenge_id = Column(Integer, ForeignKey("course_challenges.id"))
    is_solved = Column(Boolean, default=False)
    solved_at = Column(DateTime, default=datetime.utcnow)
    user_code = Column(Text, nullable=True) # Save their last successful code

    challenge = relationship("CourseChallenge", back_populates="progress")


class LessonProgress(Base):
    __tablename__ = "lesson_progress"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    content_item_id = Column(Integer, ForeignKey("content_items.id"))
    is_completed = Column(Boolean, default=True)
    completed_at = Column(DateTime, default=datetime.utcnow)

    violation_count = Column(Integer, default=0)
    is_terminated = Column(Boolean, default=False)
    
    user = relationship("User")
    content_item = relationship("ContentItem")

class UserCertificate(Base):
    __tablename__ = "user_certificates"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    course_id = Column(Integer, ForeignKey("courses.id"))
    certificate_id = Column(String(64), unique=True) # Unique UUID for verification
    issued_at = Column(DateTime, default=datetime.utcnow)
    pdf_url = Column(String(1000), nullable=True) # Optional if you store PDF file path

    user = relationship("User")
    course = relationship("Course")    

class Notification(Base):
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    title = Column(String(255))
    message = Column(String(2000))
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", backref="notifications")