import { configureStore } from '@reduxjs/toolkit';
import commonReducer from "../Redux/Slice/commonSlice"
export const store = configureStore({
    reducer: {
      data:commonReducer
    },
  });
  
  export default store;