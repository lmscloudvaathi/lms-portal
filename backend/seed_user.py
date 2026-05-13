import requests

API_URL = "http://127.0.0.1:8000/api/v1/users"


def seed_users():
    instructor = {
        "email": "instructor@iqmath.com",
        "password": "password123",
        "name": "Master Instructor",
        "role": "instructor",
        "phone_number": "9876543210",
    }

    student = {
        "email": "student@iqmath.com",
        "password": "password123",
        "name": "Test Student",
        "role": "student",
        "phone_number": "9123456789",
    }

    print("Seeding database via API...")

    try:
        res = requests.post(API_URL, json=instructor)
        if res.status_code == 201:
            print("Instructor created: instructor@iqmath.com / password123")
        elif res.status_code == 400:
            print("Instructor already exists.")
        else:
            print(f"Failed to create instructor: {res.status_code} - {res.text}")
    except Exception as e:
        print(f"Connection error: {e}")

    try:
        res = requests.post(API_URL, json=student)
        if res.status_code == 201:
            print("Student created: student@iqmath.com / password123")
        elif res.status_code == 400:
            print("Student already exists.")
        else:
            print(f"Failed to create student: {res.status_code} - {res.text}")
    except Exception as e:
        print(f"Connection error: {e}")

if __name__ == "__main__":
    seed_users()