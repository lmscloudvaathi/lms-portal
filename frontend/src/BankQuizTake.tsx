import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import API_BASE_URL from "./config";
import NativeQuizPlayer from "./components/NativeQuizPlayer";

const BankQuizTake = () => {
  const { quizId } = useParams();
  const navigate = useNavigate();
  const id = Number(quizId);
  const [title, setTitle] = useState("Quiz");

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    const token = localStorage.getItem("token");
    axios
      .get(`${API_BASE_URL}/quizzes/${id}/take`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => setTitle(res.data.title || "Quiz"))
      .catch(() => setTitle("Quiz"));
  }, [id]);

  if (!Number.isFinite(id)) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        Invalid quiz
      </div>
    );
  }

  return (
    <NativeQuizPlayer
      quizId={id}
      lessonTitle={title}
      onBack={() => navigate(-1)}
    />
  );
};

export default BankQuizTake;
