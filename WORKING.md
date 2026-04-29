# User notification system

i want my user to get notified when they are going to hit the usage ( data limit ) in less than 1 week. and in less than 2 days and in less than 1hour.

the notification logic: 
1- calculate the data_used / time_passed and see with that speed when they are going to be limited. send them notification that you are going to be limited in %N day %NN hours.
2- data_limit - data_used is less than 1GB, each day the user must get notified. 
3- the time left is less than 5 days. each day the user must get notified. 


The user must get notified each day per logic, but the user must be able to click silence for 3 days and the notification will be muted for 3 days. 

Replace the @ARCHITECTURE.md and @DESIGN.md create them from scratch based on this

