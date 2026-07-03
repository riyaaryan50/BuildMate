# BuildMate

## Project Description
BuildMate is a powerful project management tool designed to streamline the development process, enhance collaboration among team members, and improve overall productivity. It provides a user-friendly interface for tracking tasks, managing resources, and monitoring project progress.

## Features
- Task management with priority levels
- Team collaboration tools
- Progress tracking and reporting
- User authentication and role management
- Responsive design for mobile and desktop

## Tech Stack
- Frontend: React.js
- Backend: Node.js, Express
- Database: MongoDB
- Authentication: JWT
- Deployment: Heroku

## Folder Structure
```
/BuildMate
├── /client          # Frontend code
├── /server          # Backend code
├── /config          # Configuration files
├── /models          # Database models
├── /routes          # API routes
└── README.md        # Project documentation
```

## Installation Steps
1. Clone the repository:
    ```bash
    git clone https://github.com/riyaaryan50/BuildMate.git
    ```
2. Navigate to the project directory:
    ```bash
    cd BuildMate
    ```
3. Install dependencies for the client:
    ```bash
    cd client
    npm install
    ```
4. Install dependencies for the server:
    ```bash
    cd ../server
    npm install
    ```

## Environment Variables
Create a `.env` file in the `/server` directory with the following placeholders:
```
DATABASE_URL=your_database_url
JWT_SECRET=your_jwt_secret
PORT=your_port_number
```

## How to Run Locally
1. Start the server:
    ```bash
    cd server
    npm start
    ```
2. Start the client:
    ```bash
    cd ../client
    npm start
    ```

## Live Demo
Check out the live demo at: [Live Demo Link](#)

## Screenshots
![Screenshot 1](#)
![Screenshot 2](#)

## Future Improvements
- Implement real-time collaboration features
- Enhance user interface with more customization options
- Add support for multiple project views (e.g., Kanban, Gantt)

## Author
Riya Aryan

## GitHub
[riyaaryan50](https://github.com/riyaaryan50)